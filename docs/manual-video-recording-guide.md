# Hướng dẫn quay video XRP PayGuard

Tài liệu này chỉ hướng dẫn **quay hình và thao tác trên sản phẩm**. Chưa bao
gồm lời thoại, phụ đề hoặc kịch bản thuyết trình. Sau khi có footage hoàn chỉnh,
phần lời thoại sẽ được viết theo đúng những gì video thực tế ghi lại.

## 1. Mục tiêu footage

Quay đủ ba nhóm nội dung:

1. Giới thiệu nhanh vấn đề và ranh giới private/public trên landing page.
2. Thực hiện luồng chính bằng hai ví Coston2: tạo policy, đăng ký, nạp Vault,
   requester yêu cầu thanh toán, FCC đánh giá và chuyển tiền cho payee.
3. Mở các màn hình xác minh không cần ví: Demo lifecycle, Payee và Auditor.

Nên quay thành nhiều clip ngắn rồi ghép lại. Không quay một mạch vì thời gian
chờ RPC, ví, FCC và finality có thể làm hỏng toàn bộ một lần quay dài.

## 2. Chuẩn bị trước khi quay

### Trình duyệt và phần mềm quay

- Dùng Chrome ở cửa sổ riêng, độ phân giải khuyến nghị `1440 × 900` hoặc
  `1920 × 1080`.
- Đặt browser zoom ở `90%` hoặc `100%` và giữ nguyên trong toàn bộ video.
- Ẩn bookmarks bar, tab không liên quan và extension không cần thiết.
- Tắt thông báo hệ điều hành, email, Telegram, Discord và password manager.
- Dùng OBS hoặc phần mềm quay tương đương, `30 fps`, định dạng MKV nếu có thể;
  remux sang MP4 sau khi quay để tránh mất cả file nếu ứng dụng bị dừng đột ngột.
- Chỉ quay cửa sổ trình duyệt và popup ví. Không quay toàn bộ desktop nếu không
  cần thiết.
- Chưa thu giọng nói. Giữ mỗi cảnh đứng yên khoảng 2 giây trước và sau thao tác
  để dễ cắt ghép và lồng tiếng sau này.

### Website và ví

- Mở bản production: <https://xrp-payguard.vercel.app>.
- Chuẩn bị hai ví testnet:
  - **Ví A — Owner:** tạo policy, đăng ký policy và nạp Vault.
  - **Ví B — Payee/Requester:** tạo payment request và nhận FTestXRP.
- Cả hai ví phải có đủ C2FLR để trả gas; ví A cần thêm FTestXRP để nạp Vault.
- Chuyển sẵn cả hai ví sang Coston2, chain ID `114`.
- Dùng ví testnet riêng cho video. Không dùng ví chính hoặc ví chứa tài sản thật.
- Không bao giờ mở seed phrase, private key, trang export account hoặc file
  `.env` trong lúc quay.

### Dữ liệu mẫu nên chuẩn bị

Ghi riêng ngoài khung hình các giá trị sau để dán nhanh:

- Tên policy: `demo-vendor-payment`.
- Payee: địa chỉ ví B.
- Maximum per payment: `0.1` FTestXRP.
- Maximum per day: `0.3` FTestXRP.
- Số tiền nạp Vault: `1` FTestXRP hoặc cao hơn.
- Số tiền request: `0.1` FTestXRP.

Giữ `Payee` được phép request theo mặc định. Không bật `Another wallet` trong
lần quay chính, vì ví B đã đồng thời là payee và requester. Có thể quay riêng
một clip ngắn cho thấy khi bật `Another wallet`, ô nhập ví bổ sung xuất hiện.

## 3. Nguyên tắc an toàn khi quay

- Luôn để nhãn `Coston2`, `TESTNET` và `SIMULATED TEE` xuất hiện khi phù hợp.
- Không mô tả hoặc dựng hình khiến người xem hiểu đây là mainnet, private money,
  hardware attestation hoặc verified production release.
- Policy rule là private, nhưng video là công khai. Chỉ nhập dữ liệu demo;
  không nhập policy thật của cá nhân hoặc tổ chức.
- Amount, payee, requester, timing và giao dịch là dữ liệu public trên chain;
  có thể xuất hiện trong video testnet.
- Không cắt bỏ màn hình lỗi rồi dựng thành thành công giả. Nếu dependency lỗi,
  dừng clip, xử lý và quay lại cảnh đó từ đầu.
- Không quay quá trình lấy token từ faucet nếu faucet yêu cầu thông tin cá nhân
  hoặc captcha. Chuẩn bị token trước khi quay.

## 4. Cấu trúc file quay

Tạo một thư mục footage và đặt tên clip theo thứ tự dưới đây:

```text
01-landing.mp4
02-policy-rules.mp4
03-policy-review.mp4
04-custody-receipts.mp4
05-register-policy.mp4
06-fund-vault.mp4
07-load-policy-wallet-b.mp4
08-create-request.mp4
09-fcc-evaluation.mp4
10-execute-payment.mp4
11-payee-verification.mp4
12-auditor-verification.mp4
13-demo-lifecycle.mp4
14-closing-evidence.mp4
```

Nếu một clip có lỗi hoặc thao tác thừa, quay lại clip đó với hậu tố `-take2`;
không ghi đè footage cũ trước khi đã kiểm tra file mới.

## 5. Shot list chi tiết

### Clip 01 — Landing page

1. Mở landing page và chờ tải hoàn toàn.
2. Giữ hero khoảng 3 giây.
3. Cuộn chậm qua các section chính; không dừng quá lâu ở đoạn nhiều chữ.
4. Dừng ở phần mô tả private policy/public settlement khoảng 3 giây.
5. Cuộn lên hoặc dùng header cố định, bấm **Open app**.

Mục tiêu hình ảnh: tên sản phẩm, Coston2, ranh giới private/public và lối vào
ứng dụng. Thời lượng dựng dự kiến: 15–25 giây.

### Clip 02 — Tạo rule trong Policy Studio

1. Kết nối ví A và kiểm tra đang ở Coston2.
2. Mở **Policy Studio**.
3. Chọn một template. Với UI hiện tại, dùng **Delegated allowance** cho luồng
   ad-hoc; template chỉ là điểm bắt đầu, các rule nhập sau mới là nội dung cần
   tập trung quay.
4. Chuyển đến Step 02.
5. Nhập lần lượt:
   - policy name;
   - địa chỉ payee là ví B;
   - giữ `Payee` bật;
   - maximum per payment `0.1`;
   - maximum per day `0.3`;
   - chọn `Ad-hoc`;
   - giữ start time mặc định và end time mặc định sau 7 ngày.
6. Cuộn chậm một lượt để camera ghi được toàn bộ form đã điền.
7. Bấm **Continue to review**.

Không dán địa chỉ quá nhanh: sau khi dán, dừng khoảng 1 giây để người xem nhận
ra vai trò Owner, Payee và Requester. Thời lượng dựng dự kiến: 35–50 giây.

### Clip 03 — Review và compute policy

1. Quay phần tóm tắt policy ở Step 03.
2. Dừng ngắn ở hai nhóm **Public** và **Private in FCC**.
3. Bấm **Compute policy commitment**.
4. Quay commitment đã được tạo và trạng thái local validation.
5. Chuyển sang Step 04.

Không mở rộng technical details quá lâu; chỉ cần 2–3 giây nếu muốn cho thấy
domain được bind chính xác. Thời lượng dựng dự kiến: 20–30 giây.

### Clip 04 — Ba custody receipts

1. Tại Step 04, bắt đầu thu thập live FCC custody.
2. Với mỗi yêu cầu ký từ ví A:
   - quay popup ví;
   - kiểm tra đây là request từ `xrp-payguard.vercel.app` và ví A;
   - xác nhận chữ ký;
   - chờ một machine chuyển sang trạng thái đã xác minh.
3. Lặp lại cho đủ ba machine A/B/D.
4. Sau chữ ký cuối, giữ màn hình `3 / 3 receipts ready` khoảng 3 giây.

Đây là cảnh quan trọng. Không cắt khiến người xem hiểu một chữ ký tạo ra cả ba
receipt. Khi dựng có thể tăng tốc phần chờ, nhưng phải giữ đủ ba lần ký và ba
dấu hoàn thành. Thời lượng dựng dự kiến: 35–55 giây.

### Clip 05 — Đăng ký policy on-chain

1. Bấm **Register your policy on Coston2**.
2. Quay popup transaction của ví A và xác nhận.
3. Cắt ngắn thời gian chờ finality nhưng giữ spinner/trạng thái chờ tối thiểu
   1–2 giây.
4. Khi hoàn tất, giữ màn hình:
   - `Policy ACTIVE on Coston2`;
   - finalized block;
   - owner;
   - ba receipt đã signed.
5. Copy public policy commitment và lưu bên ngoài khung hình để dùng với ví B.
6. Bấm **Fund your vault**.

Thời lượng dựng dự kiến: 25–40 giây.

### Clip 06 — Nạp Vault

1. Trong **Vaults**, dừng ở card action trước card thông tin.
2. Quay finalized Vault balance, wallet balance và allowance.
3. Nhập `1` FTestXRP rồi bấm **Deposit FTestXRP**.
4. Quay màn hình review operation. UI sẽ tự xác định:
   - chỉ deposit nếu allowance đủ; hoặc
   - exact approval rồi deposit nếu allowance chưa đủ.
5. Bấm continue và xác nhận từng popup ví A.
6. Sau mỗi transaction, giữ dấu hoàn thành màu xanh khoảng 1 giây.
7. Khi xong, quay `Deposit complete` và Vault available balance mới.

Không gọi đây là một transaction nếu UI yêu cầu hai lần xác nhận. Đây là một
ý định nạp tiền nhưng có thể gồm hai transaction on-chain độc lập. Thời lượng
dựng dự kiến: 35–60 giây.

### Clip 07 — Chuyển sang ví B và load policy

1. Đổi account trong ví từ A sang B.
2. Chờ website nhận account và network mới.
3. Mở **Requests** → **Request payment**.
4. Dán public policy commitment đã copy.
5. Nhập payee là ví B và amount `0.1` FTestXRP.
6. Bấm **Load active policy**.
7. Giữ trạng thái policy active và owner được đọc từ finalized registry khoảng
   2–3 giây.

Policy commitment là public nên được phép xuất hiện. Không mở clipboard manager
hoặc ứng dụng ghi chú trong vùng quay. Thời lượng dựng dự kiến: 20–30 giây.

### Clip 08 — Tạo payment request

1. Với ví B đang kết nối, bấm **Request payment**.
2. Quay popup transaction và xác nhận bằng ví B.
3. Chờ request đạt trạng thái `PENDING`.
4. Giữ màn hình có policy, owner, requester, payee, amount và Request ID khoảng
   3 giây.

Điểm hình ảnh cần rõ: ví B tự tạo request; ví A không ký lại ở bước này.
Thời lượng dựng dự kiến: 20–35 giây.

### Clip 09 — FCC evaluation

1. Bấm **Authorize FCC evaluation**.
2. Quay chữ ký ngắn hạn của ví B.
3. Chờ FCC trả về hai kết quả khớp nhau.
4. Khi request chuyển sang `ALLOWED`, giữ màn hình khoảng 3 giây.
5. Đảm bảo `ALLOW`, amount và trạng thái reserved xuất hiện trong khung hình.

Không mô tả relay hoặc browser là bên quyết định. Footage phải thể hiện request
chỉ được chuyển sang `ALLOWED` sau threshold FCC. Thời lượng dựng dự kiến:
25–45 giây.

### Clip 10 — Execute payment

1. Bấm **Execute authorized transfer**.
2. Quay popup transaction của ví B và xác nhận.
3. Chờ trạng thái `EXECUTED`.
4. Giữ màn hình final result và Vault available khoảng 3 giây.
5. Nếu có explorer link, mở trong tab mới và quay receipt/block khoảng 3 giây,
   sau đó quay lại ứng dụng.

Thời lượng dựng dự kiến: 20–35 giây.

### Clip 11 — Payee verification

1. Mở **Payee** trong nhóm `VERIFY`.
2. Chọn một ID đã thực thi từ dropdown hoặc dán Request ID vừa tạo nếu UI cho
   phép đọc trực tiếp.
3. Bấm load/verify.
4. Quay amount, payee, execution status, finalized block và explorer link.
5. Có thể quay thêm một ID mẫu `DENIED` hoặc `CANCELLED` trong clip phụ để cho
   thấy màn hình không biến trạng thái thất bại thành thanh toán thành công.

Thời lượng dựng dự kiến: 20–30 giây.

### Clip 12 — Auditor verification

1. Mở **Auditor**.
2. Chọn cùng Request ID đã dùng ở Payee.
3. Quay các public facts: policy commitment, owner, requester, payee, result,
   conservation và transaction evidence.
4. Mở một explorer link trong tab mới, giữ 2–3 giây rồi quay lại.

Mục tiêu: cho thấy auditor kiểm tra mà không cần kết nối hoặc biết private rule.
Thời lượng dựng dự kiến: 20–35 giây.

### Clip 13 — Demo lifecycle

1. Mở **Demo lifecycle**.
2. Quay primary V2 proof theo thứ tự:
   - ba registered A/B/D machines;
   - all-three custody;
   - two matching results và ALLOW execution;
   - `CAP_EXCEEDED` DENY;
   - stop/resume/revoke;
   - Vault conservation;
   - public Coston2 checkpoints.
3. Dừng ở nhãn `SIMULATED_TEE` đủ lâu để đọc được.
4. Không cần mở historical/legacy section trừ khi muốn có clip phụ.

Đây là bằng chứng wallet-free đã ghi nhận từ trước, không phải giao dịch được tạo
trong lúc quay. Thời lượng dựng dự kiến: 35–50 giây.

### Clip 14 — Closing evidence

1. Quay lại một màn hình sạch, ưu tiên Demo lifecycle hoặc landing evidence.
2. Để các nhãn Coston2, public evidence và simulated boundary trong cùng khung.
3. Giữ hình tĩnh 4–5 giây để làm ending card khi dựng.

## 6. Các clip phụ nên quay

Các clip này không bắt buộc trong bản chính, nhưng hữu ích khi cần minh họa:

- Bật/tắt quyền `Payee` và bật `Another wallet` trong Policy Studio.
- `Inspect request` với một trong bốn ID mẫu.
- Payee hoặc Auditor load một ID `DENIED` để thể hiện fail-closed.
- Owner bấm `Stop policy`, sau đó `Resume policy`.
- Owner mở `Revoke permanently`, nhưng chỉ quay thao tác nếu thực sự muốn hủy
  policy test dùng cho video; revoke không thể hoàn tác.
- Mở evidence index JSON hoặc một transaction trên Coston2 Explorer.

Không quay revoke trước khi hoàn thành toàn bộ footage request/payment của
policy đó.

## 7. Khi một bước bị lỗi

- Wallet popup không hiện: kiểm tra popup bị ẩn sau cửa sổ hoặc ví đang khóa.
- Sai network: chuyển cả website và ví về Coston2 rồi quay lại clip đó từ đầu.
- FCC/RPC tạm unavailable: giữ nguyên dữ liệu, đợi dependency phục hồi và quay
  lại clip; không dùng mock success.
- Request bị `DENIED`: giữ clip làm negative footage, sau đó tạo request mới với
  đúng payee, requester, amount và policy window.
- Transaction pending quá lâu: dừng recording để tránh file dài, theo dõi trên
  explorer, rồi quay clip tiếp theo khi finalized.
- Đổi ví làm mất dữ liệu in-memory: dùng public policy commitment và Request ID
  đã copy để load lại từ finalized chain state.

## 8. Kiểm tra footage sau khi quay

Xem lại toàn bộ từng clip trước khi xóa hoặc reset bất kỳ policy nào:

- hình ảnh rõ, không giật hoặc bị popup che sai vùng;
- không có seed phrase, private key, credential, email hoặc thông báo cá nhân;
- đủ ba custody signatures/receipts;
- policy hiển thị `ACTIVE` trước khi nạp và request;
- Vault deposit đã finalized;
- ví B là requester/payee trong request chính;
- request đi qua `PENDING` → `ALLOWED` → `EXECUTED`;
- Payee và Auditor đọc đúng Request ID;
- nhãn Coston2/testnet/simulated không bị cắt khỏi mọi cảnh liên quan;
- explorer link mở đúng chain và transaction;
- không có claim hoặc hình ảnh ngụ ý private transfer, hardware attestation hay
  verified mainnet release.

Giữ nguyên file footage gốc. Chỉ tạo bản sao để cắt ghép. Sau khi chốt được một
bản dựng hình không lời, mới đo thời lượng từng cảnh và viết lời thoại khớp với
video thực tế.
