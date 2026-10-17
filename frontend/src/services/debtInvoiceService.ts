// Dịch vụ quản lý công nợ & hoá đơn đã phát hành (SCRUM-755 / SCRUM-268)
import { DebtInvoice, DebtFilter, PaymentTransaction } from '../types/DebtInvoice';
import { initialDebtInvoices } from '../mock/debtInvoices';
import { getStorageItem, setStorageItem } from './storage';
import { formatCurrency } from '../utils/formatters';

const STORAGE_KEY = 'kv_debt_invoices';

export const debtInvoiceService = {
  /**
   * Lấy toàn bộ danh sách hoá đơn công nợ
   */
  getAll: (filter?: DebtFilter): DebtInvoice[] => {
    let list = getStorageItem<DebtInvoice[]>(STORAGE_KEY, initialDebtInvoices);

    if (!filter) return list;

    if (filter.search && filter.search.trim()) {
      const q = filter.search.toLowerCase().trim();
      list = list.filter(
        (inv) =>
          inv.invoiceNumber.toLowerCase().includes(q) ||
          inv.orderCode.toLowerCase().includes(q) ||
          inv.agentName.toLowerCase().includes(q) ||
          (inv.agentTaxCode && inv.agentTaxCode.includes(q))
      );
    }

    if (filter.agentId && filter.agentId !== 'all') {
      list = list.filter((inv) => inv.agentId === filter.agentId);
    }

    if (filter.status && filter.status !== 'all') {
      list = list.filter((inv) => inv.status === filter.status);
    }

    if (filter.startDate) {
      list = list.filter((inv) => inv.issueDate >= filter.startDate!);
    }

    if (filter.endDate) {
      list = list.filter((inv) => inv.issueDate <= filter.endDate!);
    }

    return list;
  },

  /**
   * Lấy chi tiết một hoá đơn theo ID hoặc Số hoá đơn
   */
  getById: (idOrNumber: string): DebtInvoice | undefined => {
    const list = debtInvoiceService.getAll();
    return list.find(
      (inv) =>
        inv.id === idOrNumber ||
        inv.invoiceNumber === idOrNumber ||
        inv.orderCode === idOrNumber ||
        inv.orderId === idOrNumber
    );
  },

  /**
   * Tải lại hoá đơn điện tử định dạng PDF (hoặc sinh tài liệu in ấn chuẩn hoá)
   */
  downloadInvoicePdf: (invoice: DebtInvoice): void => {
    // Tạo nội dung hoá đơn HTML để tải xuống hoặc xuất PDF
    const content = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Hóa Đơn Điện Tử - ${invoice.invoiceNumber}</title>
        <style>
          body { font-family: 'Times New Roman', Times, serif; font-size: 13px; line-height: 1.4; color: #111; padding: 25px; margin: 0; }
          .header { text-align: center; border-bottom: 2px solid #222; padding-bottom: 12px; margin-bottom: 15px; }
          .title { font-size: 20px; font-weight: bold; text-transform: uppercase; margin: 5px 0; color: #1e3a8a; }
          .info-grid { display: flex; justify-content: space-between; margin-bottom: 15px; }
          .box { width: 48%; }
          table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          th, td { border: 1px solid #333; padding: 6px 8px; text-align: left; }
          th { background: #f3f4f6; text-align: center; font-weight: bold; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .total-box { margin-top: 10px; width: 400px; margin-left: auto; }
          .total-row { display: flex; justify-content: space-between; padding: 3px 0; }
          .grand-total { font-size: 15px; font-weight: bold; color: #b91c1c; border-top: 1px solid #333; padding-top: 5px; }
          .signature-box { display: flex; justify-content: space-between; margin-top: 35px; text-align: center; }
          .digital-stamp { border: 2px solid #dc2626; color: #dc2626; padding: 8px 12px; border-radius: 6px; display: inline-block; font-size: 11px; margin-top: 10px; font-family: Arial, sans-serif; }
        </style>
      </head>
      <body>
        <div class="header">
          <div style="font-size: 12px; font-weight: bold;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
          <div style="font-size: 11px;">Độc lập - Tự do - Hạnh phúc</div>
          <div class="title">HÓA ĐƠN GIÁ TRỊ GIA TĂNG</div>
          <div>(HÓA ĐƠN ĐIỆN TỬ THEO TT 78/2021/TT-BTC)</div>
          <div style="margin-top: 6px; font-weight: bold;">Ký hiệu: ${invoice.invoiceSeries} | Mẫu số: ${invoice.templateCode} | Số: ${invoice.invoiceNumber}</div>
          <div style="font-size: 11px; color: #555;">Ngày phát hành: ${invoice.issueDate}</div>
        </div>

        <div class="info-grid">
          <div class="box">
            <strong>ĐƠN VỊ BÁN HÀNG:</strong><br />
            <strong>${invoice.sellerName}</strong><br />
            Mã số thuế: <strong>${invoice.sellerTaxCode}</strong><br />
            Địa chỉ: ${invoice.sellerAddress}<br />
            Số tài khoản: ${invoice.sellerBankAccount} - ${invoice.sellerBankName}
          </div>
          <div class="box">
            <strong>NGƯỜI MUA HÀNG (ĐẠI LÝ):</strong><br />
            <strong>${invoice.agentName}</strong><br />
            Mã số thuế: <strong>${invoice.agentTaxCode || '—'}</strong><br />
            Địa chỉ: ${invoice.agentAddress || '—'}<br />
            Mã đơn hàng liên kết: <strong>${invoice.orderCode}</strong>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 35px;">STT</th>
              <th>Tên hàng hóa, dịch vụ</th>
              <th style="width: 60px;">ĐVT</th>
              <th style="width: 70px;">Số lượng</th>
              <th style="width: 100px;">Đơn giá</th>
              <th style="width: 60px;">Thuế</th>
              <th style="width: 110px;">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            ${invoice.items
              .map(
                (it, idx) => `
              <tr>
                <td class="text-center">${idx + 1}</td>
                <td><strong>${it.name}</strong><br/><span style="font-size: 10px; color: #666;">SKU: ${it.sku}</span></td>
                <td class="text-center">${it.unit}</td>
                <td class="text-center"><strong>${it.quantity}</strong></td>
                <td class="text-right">${formatCurrency(it.unitPrice)}</td>
                <td class="text-center">${it.vatRate}%</td>
                <td class="text-right"><strong>${formatCurrency(it.total)}</strong></td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>

        <div class="total-box">
          <div class="total-row"><span>Cộng tiền hàng (chưa VAT):</span><span>${formatCurrency(invoice.subtotalAmount)}</span></div>
          <div class="total-row"><span>Tiền thuế GTGT (${invoice.vatRateAverage}%):</span><span>+${formatCurrency(invoice.vatAmount)}</span></div>
          <div class="total-row grand-total"><span>TỔNG CỘNG THANH TOÁN:</span><span>${formatCurrency(invoice.grandTotal)}</span></div>
          <div class="total-row" style="font-size: 11px; color: #444; margin-top: 4px;"><span>Đã thanh toán:</span><span>${formatCurrency(invoice.paidAmount)}</span></div>
          <div class="total-row" style="font-size: 12px; font-weight: bold; color: #b91c1c;"><span>Công nợ còn lại:</span><span>${formatCurrency(invoice.remainingDebt)}</span></div>
        </div>

        <div class="signature-box">
          <div style="width: 45%;">
            <strong>NGƯỜI MUA HÀNG</strong><br/>
            (Ký, ghi rõ họ tên)<br/><br/><br/>
            <em>${invoice.agentName}</em>
          </div>
          <div style="width: 45%;">
            <strong>NGƯỜI BÁN HÀNG</strong><br/>
            (Ký điện tử)<br/>
            <div class="digital-stamp">
              ✓ ĐÃ KÝ ĐIỆN TỬ BỞI<br/>
              <strong>${invoice.digitalSignature.signer}</strong><br/>
              Thời gian ký: ${invoice.digitalSignature.signedAt}
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    // Tải xuống file HTML / in hóa đơn
    const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Hoa_Don_${invoice.invoiceSeries}_${invoice.invoiceNumber}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * Tải lại tệp dữ liệu hoá đơn điện tử định dạng XML (theo chuẩn Thông tư 78)
   */
  downloadInvoiceXml: (invoice: DebtInvoice): void => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<HDon>
  <DLHDon Id="HD_${invoice.id}">
    <TTChung>
      <PBan>2.0.0</PBan>
      <THDon>Hóa đơn giá trị gia tăng</THDon>
      <KHMSHDon>${invoice.templateCode}</KHMSHDon>
      <KHHDon>${invoice.invoiceSeries}</KHHDon>
      <SHDon>${invoice.invoiceNumber}</SHDon>
      <NLap>${invoice.issueDate}</NLap>
      <DVTTe>VND</DVTTe>
      <TGia>1</TGia>
    </TTChung>
    <NDHDon>
      <NBan>
        <Ten>${invoice.sellerName}</Ten>
        <MST>${invoice.sellerTaxCode}</MST>
        <DChi>${invoice.sellerAddress}</DChi>
        <STKNHang>${invoice.sellerBankAccount || ''}</STKNHang>
        <TNHang>${invoice.sellerBankName || ''}</TNHang>
      </NBan>
      <NMua>
        <Ten>${invoice.agentName}</Ten>
        <MST>${invoice.agentTaxCode || ''}</MST>
        <DChi>${invoice.agentAddress || ''}</DChi>
        <SDThoai>${invoice.agentPhone || ''}</SDThoai>
        <MDH>${invoice.orderCode}</MDH>
      </NMua>
      <DSHHDVu>
        ${invoice.items
          .map(
            (it, idx) => `
        <HHDVu>
          <STT>${idx + 1}</STT>
          <THHDVu>${it.name}</THHDVu>
          <DVTinh>${it.unit}</DVTinh>
          <SLuong>${it.quantity}</SLuong>
          <DGia>${it.unitPrice}</DGia>
          <TSuat>${it.vatRate}%</TSuat>
          <ThTien>${it.subtotal}</ThTien>
        </HHDVu>`
          )
          .join('\n')}
      </DSHHDVu>
      <TToan>
        <TgTCThue>${invoice.subtotalAmount}</TgTCThue>
        <TgTThue>${invoice.vatAmount}</TgTThue>
        <TgTTTBSo>${invoice.grandTotal}</TgTTTBSo>
      </TToan>
    </NDHDon>
    <DSCKS>
      <NBan>
        <Signature>${invoice.digitalSignature.signer}</Signature>
        <SigningTime>${invoice.digitalSignature.signedAt}</SigningTime>
        <Serial>${invoice.digitalSignature.certificateSerial || ''}</Serial>
      </NBan>
    </DSCKS>
  </DLHDon>
</HDon>`;

    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Hoa_Don_${invoice.invoiceSeries}_${invoice.invoiceNumber}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * Ghi nhận thanh toán công nợ cho một hoá đơn
   */
  recordPayment: (
    invoiceId: string,
    amount: number,
    paymentMethod: 'bank_transfer' | 'cash' | 'credit' = 'bank_transfer',
    reference?: string,
    note?: string,
    recorder: string = 'Kế toán công nợ'
  ): DebtInvoice => {
    const list = getStorageItem<DebtInvoice[]>(STORAGE_KEY, initialDebtInvoices);
    const idx = list.findIndex((i) => i.id === invoiceId || i.invoiceNumber === invoiceId);
    if (idx === -1) throw new Error('Không tìm thấy hoá đơn công nợ');

    const inv = list[idx];
    const newPaidAmount = Math.min(inv.grandTotal, inv.paidAmount + amount);
    const newRemainingDebt = Math.max(0, inv.grandTotal - newPaidAmount);

    let newStatus = inv.status;
    if (newRemainingDebt === 0) {
      newStatus = 'paid';
    } else if (newPaidAmount > 0) {
      newStatus = 'partially_paid';
    }

    const newPayment: PaymentTransaction = {
      id: `PAY-${Date.now()}`,
      paymentCode: `TT-${Date.now().toString().slice(-6)}`,
      amount,
      paymentMethod,
      transactionReference: reference,
      paymentDate: new Date().toISOString().replace('T', ' ').slice(0, 16),
      note,
      recordedBy: recorder,
    };

    const updated: DebtInvoice = {
      ...inv,
      paidAmount: newPaidAmount,
      remainingDebt: newRemainingDebt,
      status: newStatus,
      payments: [newPayment, ...inv.payments],
    };

    list[idx] = updated;
    setStorageItem(STORAGE_KEY, list);
    return updated;
  },
};
