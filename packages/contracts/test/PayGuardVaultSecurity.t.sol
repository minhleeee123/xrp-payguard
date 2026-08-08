// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import { PayGuardVault } from "../src/PayGuardVault.sol";
import { MockToken } from "./MockToken.sol";
import { TestBase } from "./TestBase.sol";

contract AdversarialToken {
    mapping(address account => uint256 balance) public balanceOf;
    mapping(address owner => mapping(address spender => uint256 amount)) public allowance;
    PayGuardVault public vault;
    bool public failTransfer;
    bool public feeOnTransferFrom;
    bool public reenterTransferFrom;
    bool public reentryBlocked;

    function configureVault(
        PayGuardVault vault_
    ) external {
        vault = vault_;
    }

    function configure(
        bool failTransfer_,
        bool feeOnTransferFrom_,
        bool reenterTransferFrom_
    ) external {
        failTransfer = failTransfer_;
        feeOnTransferFrom = feeOnTransferFrom_;
        reenterTransferFrom = reenterTransferFrom_;
    }

    function mint(
        address account,
        uint256 amount
    ) external {
        balanceOf[account] += amount;
    }

    function approve(
        address spender,
        uint256 amount
    ) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(
        address to,
        uint256 amount
    ) external returns (bool) {
        if (failTransfer || balanceOf[msg.sender] < amount) return false;
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool) {
        if (balanceOf[from] < amount || allowance[from][msg.sender] < amount) return false;
        if (reenterTransferFrom) {
            (bool success,) =
                address(vault).call(abi.encodeCall(PayGuardVault.deposit, (address(this), 1, from)));
            reentryBlocked = !success;
        }
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        uint256 received = feeOnTransferFrom && amount != 0 ? amount - 1 : amount;
        balanceOf[to] += received;
        return true;
    }
}

contract PayGuardVaultSecurityTest is TestBase {
    PayGuardVault internal vault;
    AdversarialToken internal token;
    address internal recipient = address(0xBEEF);

    function setUp() public {
        vault = new PayGuardVault(address(this));
        token = new AdversarialToken();
        token.configureVault(vault);
        vault.setSupportedAsset(address(token), true);
        vault.setRouter(address(this));
        token.mint(address(this), 1_000);
        token.approve(address(vault), type(uint256).max);
    }

    function testReentrantTransferFromIsBlockedWithoutBreakingDeposit() public {
        token.configure(false, false, true);
        vault.deposit(address(token), 100, address(this));
        assertTrue(token.reentryBlocked());
        PayGuardVault.Accounting memory accounting = vault.accounting(address(this), address(token));
        _assertConservation(accounting);
        assertEq(accounting.available, 100);
    }

    function testFeeOnTransferDepositRevertsWithoutAccountingDrift() public {
        token.configure(false, true, false);
        vm.expectRevert(PayGuardVault.TransferFailed.selector);
        vault.deposit(address(token), 100, address(this));
        PayGuardVault.Accounting memory accounting = vault.accounting(address(this), address(token));
        assertEq(accounting.deposited, 0);
        assertEq(token.balanceOf(address(vault)), 0);
    }

    function testTokenFailureOnExecuteRestoresReservationAndBuckets() public {
        vault.deposit(address(token), 100, address(this));
        bytes32 requestId = keccak256("failed-execute");
        vault.reserve(address(this), address(token), requestId, 40);
        token.configure(true, false, false);
        vm.expectRevert(PayGuardVault.TransferFailed.selector);
        vault.execute(requestId, recipient);
        (address reservationOwner, address reservationAsset, uint256 amount, bool active) =
            vault.reservations(requestId);
        assertEq(reservationOwner, address(this));
        assertEq(reservationAsset, address(token));
        assertEq(amount, 40);
        assertEq(active, true);
        PayGuardVault.Accounting memory accounting = vault.accounting(address(this), address(token));
        _assertConservation(accounting);
        assertEq(accounting.reserved, 40);
        assertEq(accounting.spent, 0);
    }

    function testTokenFailureOnWithdrawRestoresAvailableAndWithdrawn() public {
        vault.deposit(address(token), 100, address(this));
        token.configure(true, false, false);
        vm.expectRevert(PayGuardVault.TransferFailed.selector);
        vault.withdraw(address(token), 25, recipient);
        PayGuardVault.Accounting memory accounting = vault.accounting(address(this), address(token));
        _assertConservation(accounting);
        assertEq(accounting.available, 100);
        assertEq(accounting.withdrawn, 0);
    }

    function _assertConservation(
        PayGuardVault.Accounting memory accounting
    ) private pure {
        require(
            accounting.deposited
                == accounting.available + accounting.reserved + accounting.spent
                    + accounting.withdrawn + accounting.refunded,
            "conservation"
        );
    }
}

contract PayGuardVaultFuzzTest is TestBase {
    function testFuzzConservationAcrossReleaseAndWithdraw(
        uint96 rawDeposit,
        uint96 rawReserve,
        uint96 rawWithdraw
    ) public {
        uint256 depositAmount = uint256(rawDeposit) + 1;
        uint256 reserveAmount = uint256(rawReserve) % (depositAmount + 1);
        PayGuardVault vault = new PayGuardVault(address(this));
        MockToken token = new MockToken();
        vault.setSupportedAsset(address(token), true);
        vault.setRouter(address(this));
        token.mint(address(this), depositAmount);
        token.approve(address(vault), depositAmount);
        vault.deposit(address(token), depositAmount, address(this));
        if (reserveAmount != 0) {
            vault.reserve(
                address(this), address(token), keccak256("fuzz-reservation"), reserveAmount
            );
            vault.release(keccak256("fuzz-reservation"));
        }
        uint256 withdrawAmount = uint256(rawWithdraw) % (depositAmount + 1);
        if (withdrawAmount != 0) vault.withdraw(address(token), withdrawAmount, address(0xCAFE));
        PayGuardVault.Accounting memory accounting = vault.accounting(address(this), address(token));
        assertEq(
            accounting.deposited,
            accounting.available + accounting.reserved + accounting.spent + accounting.withdrawn
                + accounting.refunded
        );
        assertEq(token.balanceOf(address(vault)), accounting.available + accounting.reserved);
    }
}

contract PayGuardVaultHandler {
    PayGuardVault public immutable vault;
    MockToken public immutable token;
    address public immutable payee = address(0xD00D);
    bytes32[] private requestIds;
    uint256 private nextRequest;

    constructor() {
        vault = new PayGuardVault(address(this));
        token = new MockToken();
        vault.setSupportedAsset(address(token), true);
        vault.setRouter(address(this));
        token.approve(address(vault), type(uint256).max);
        _deposit(1 ether);
    }

    function deposit(
        uint96 rawAmount
    ) external {
        _deposit(uint256(rawAmount) % 1 ether + 1);
    }

    function withdraw(
        uint96 rawAmount
    ) external {
        PayGuardVault.Accounting memory accounting = vault.accounting(address(this), address(token));
        if (accounting.available == 0) return;
        uint256 amount = uint256(rawAmount) % accounting.available + 1;
        vault.withdraw(address(token), amount, payee);
    }

    function reserve(
        uint96 rawAmount
    ) external {
        PayGuardVault.Accounting memory accounting = vault.accounting(address(this), address(token));
        if (accounting.available == 0) return;
        uint256 amount = uint256(rawAmount) % accounting.available + 1;
        bytes32 requestId = keccak256(abi.encode("invariant", nextRequest++));
        requestIds.push(requestId);
        vault.reserve(address(this), address(token), requestId, amount);
    }

    function release(
        uint256 rawIndex
    ) external {
        if (requestIds.length == 0) return;
        bytes32 requestId = requestIds[rawIndex % requestIds.length];
        (,,, bool active) = vault.reservations(requestId);
        if (active) vault.release(requestId);
    }

    function execute(
        uint256 rawIndex
    ) external {
        if (requestIds.length == 0) return;
        bytes32 requestId = requestIds[rawIndex % requestIds.length];
        (,,, bool active) = vault.reservations(requestId);
        if (active) vault.execute(requestId, payee);
    }

    function activeReservationTotal() external view returns (uint256 total) {
        for (uint256 index; index < requestIds.length; index++) {
            (,, uint256 amount, bool active) = vault.reservations(requestIds[index]);
            if (active) total += amount;
        }
    }

    function _deposit(
        uint256 amount
    ) private {
        token.mint(address(this), amount);
        vault.deposit(address(token), amount, address(this));
    }
}

contract PayGuardVaultInvariantTest is TestBase {
    PayGuardVaultHandler internal handler;

    function setUp() public {
        handler = new PayGuardVaultHandler();
    }

    function targetContracts() external view returns (address[] memory targets) {
        targets = new address[](1);
        targets[0] = address(handler);
    }

    function invariantConservationBucketsAndReservationsAgree() public view {
        PayGuardVault vault = handler.vault();
        MockToken token = handler.token();
        PayGuardVault.Accounting memory accounting =
            vault.accounting(address(handler), address(token));
        assertEq(
            accounting.deposited,
            accounting.available + accounting.reserved + accounting.spent + accounting.withdrawn
                + accounting.refunded
        );
        assertEq(accounting.reserved, handler.activeReservationTotal());
        assertEq(token.balanceOf(address(vault)), accounting.available + accounting.reserved);
    }
}
