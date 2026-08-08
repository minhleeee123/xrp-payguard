// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

interface IERC20PayGuard {
    function balanceOf(
        address account
    ) external view returns (uint256);
    function transfer(
        address to,
        uint256 amount
    ) external returns (bool);
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool);
}

/// @notice Non-upgradeable public asset vault with explicit conservation
/// buckets. The router is the only authority that can reserve or execute.
contract PayGuardVault {
    error NotAdmin();
    error NotRouter();
    error InvalidAsset();
    error InvalidAmount();
    error InvalidAddress();
    error AlreadyWired();
    error AssetCannotBeDisabled();
    error InsufficientAvailable();
    error ReservationExists();
    error UnknownReservation();
    error TransferFailed();
    error ConservationViolation();
    error Reentrancy();

    struct Accounting {
        uint256 deposited;
        uint256 available;
        uint256 reserved;
        uint256 spent;
        uint256 withdrawn;
        uint256 refunded;
    }

    struct Reservation {
        address owner;
        address asset;
        uint256 amount;
        bool active;
    }

    address public immutable admin;
    address public router;
    bool private entered;
    mapping(address asset => bool supported) public supportedAsset;
    mapping(address owner => mapping(address asset => Accounting accounting)) private accounts;
    mapping(bytes32 requestId => Reservation reservation) public reservations;

    event AssetSupportUpdated(address indexed asset, bool supported);
    event RouterWired(address indexed router);
    event Deposited(address indexed owner, address indexed asset, uint256 amount);
    event Withdrawn(
        address indexed owner, address indexed asset, address indexed to, uint256 amount
    );
    event Reserved(
        bytes32 indexed requestId, address indexed owner, address indexed asset, uint256 amount
    );
    event Released(bytes32 indexed requestId, uint256 amount);
    event Executed(bytes32 indexed requestId, address indexed target, uint256 amount);

    constructor(
        address admin_
    ) {
        if (admin_ == address(0)) revert InvalidAddress();
        admin = admin_;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier onlyRouter() {
        if (msg.sender != router || router == address(0)) revert NotRouter();
        _;
    }

    modifier nonReentrant() {
        if (entered) revert Reentrancy();
        entered = true;
        _;
        entered = false;
    }

    function setSupportedAsset(
        address asset,
        bool supported
    ) external onlyAdmin {
        if (asset == address(0)) revert InvalidAsset();
        if (!supported && supportedAsset[asset]) revert AssetCannotBeDisabled();
        supportedAsset[asset] = supported;
        emit AssetSupportUpdated(asset, supported);
    }

    function setRouter(
        address router_
    ) external onlyAdmin {
        if (router != address(0)) revert AlreadyWired();
        if (router_ == address(0)) revert InvalidAddress();
        router = router_;
        emit RouterWired(router_);
    }

    function accounting(
        address owner,
        address asset
    ) external view returns (Accounting memory) {
        return accounts[owner][asset];
    }

    function deposit(
        address asset,
        uint256 amount,
        address beneficiary
    ) external nonReentrant {
        if (!supportedAsset[asset]) revert InvalidAsset();
        if (amount == 0 || beneficiary == address(0)) revert InvalidAmount();
        uint256 beforeBalance = IERC20PayGuard(asset).balanceOf(address(this));
        _safeTransferFrom(asset, msg.sender, address(this), amount);
        uint256 afterBalance = IERC20PayGuard(asset).balanceOf(address(this));
        if (afterBalance != beforeBalance + amount) revert TransferFailed();
        Accounting storage entry = accounts[beneficiary][asset];
        entry.deposited += amount;
        entry.available += amount;
        _assertConservation(entry);
        emit Deposited(beneficiary, asset, amount);
    }

    function withdraw(
        address asset,
        uint256 amount,
        address to
    ) external nonReentrant {
        if (!supportedAsset[asset]) revert InvalidAsset();
        if (amount == 0 || to == address(0)) revert InvalidAmount();
        Accounting storage entry = accounts[msg.sender][asset];
        if (entry.available < amount) revert InsufficientAvailable();
        entry.available -= amount;
        entry.withdrawn += amount;
        _assertConservation(entry);
        _safeTransfer(asset, to, amount);
        emit Withdrawn(msg.sender, asset, to, amount);
    }

    function reserve(
        address owner,
        address asset,
        bytes32 requestId,
        uint256 amount
    ) external onlyRouter {
        if (!supportedAsset[asset] || owner == address(0) || requestId == bytes32(0) || amount == 0)
        {
            revert InvalidAmount();
        }
        if (reservations[requestId].active) revert ReservationExists();
        Accounting storage entry = accounts[owner][asset];
        if (entry.available < amount) revert InsufficientAvailable();
        entry.available -= amount;
        entry.reserved += amount;
        reservations[requestId] =
            Reservation({ owner: owner, asset: asset, amount: amount, active: true });
        _assertConservation(entry);
        emit Reserved(requestId, owner, asset, amount);
    }

    function release(
        bytes32 requestId
    ) external onlyRouter {
        Reservation memory reservation = reservations[requestId];
        if (!reservation.active) revert UnknownReservation();
        Accounting storage entry = accounts[reservation.owner][reservation.asset];
        entry.reserved -= reservation.amount;
        entry.available += reservation.amount;
        delete reservations[requestId];
        _assertConservation(entry);
        emit Released(requestId, reservation.amount);
    }

    function execute(
        bytes32 requestId,
        address target
    ) external onlyRouter nonReentrant {
        Reservation memory reservation = reservations[requestId];
        if (!reservation.active) revert UnknownReservation();
        if (target == address(0)) revert InvalidAddress();
        Accounting storage entry = accounts[reservation.owner][reservation.asset];
        entry.reserved -= reservation.amount;
        entry.spent += reservation.amount;
        delete reservations[requestId];
        _assertConservation(entry);
        uint256 beforeBalance = IERC20PayGuard(reservation.asset).balanceOf(target);
        _safeTransfer(reservation.asset, target, reservation.amount);
        uint256 afterBalance = IERC20PayGuard(reservation.asset).balanceOf(target);
        if (afterBalance != beforeBalance + reservation.amount) revert TransferFailed();
        emit Executed(requestId, target, reservation.amount);
    }

    function _assertConservation(
        Accounting memory entry
    ) private pure {
        if (
            entry.deposited
                != entry.available + entry.reserved + entry.spent + entry.withdrawn + entry.refunded
        ) {
            revert ConservationViolation();
        }
    }

    function _safeTransfer(
        address asset,
        address to,
        uint256 amount
    ) private {
        (bool success, bytes memory data) =
            asset.call(abi.encodeCall(IERC20PayGuard.transfer, (to, amount)));
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }

    function _safeTransferFrom(
        address asset,
        address from,
        address to,
        uint256 amount
    ) private {
        (bool success, bytes memory data) =
            asset.call(abi.encodeCall(IERC20PayGuard.transferFrom, (from, to, amount)));
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }
}
