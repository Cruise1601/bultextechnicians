const DAILY_KEY = 'bultexDailyRecords';
const SPARE_KEY = 'bultexSpareRecords';
const PAYMENT_KEY = 'bultexPaymentRecords';

const dailyForm = document.getElementById('dailyForm');
const spareForm = document.getElementById('spareForm');
const paymentForm = document.getElementById('paymentForm');
const dailyRecordsBody = document.getElementById('dailyRecordsBody');
const spareRecordsBody = document.getElementById('spareRecordsBody');
const paymentRecordsBody = document.getElementById('paymentRecordsBody');
const receiptPreview = document.getElementById('receiptPreview');
const printReceiptBtn = document.getElementById('printReceiptBtn');

function readData(key) {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Unable to read local data', error);
    return [];
  }
}

function saveData(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function renderDailyRecords() {
  const records = readData(DAILY_KEY);
  dailyRecordsBody.innerHTML = records.length
    ? records
        .map(
          (record) => `
            <tr>
              <td>${record.date}</td>
              <td>${record.technicianName}</td>
              <td>${record.clientEquipment}</td>
              <td>${record.dailyActivity}</td>
              <td>${record.workStatus}</td>
            </tr>
          `
        )
        .join('')
    : '<tr><td colspan="5">No daily records added yet.</td></tr>';
}

function renderSpareRecords() {
  const records = readData(SPARE_KEY);
  spareRecordsBody.innerHTML = records.length
    ? records
        .map(
          (record) => `
            <tr>
              <td>${record.date}</td>
              <td>${record.issueFixed}</td>
              <td>${record.spareName}</td>
              <td>${record.supplierPhone}</td>
              <td>${record.spareSource}</td>
              <td>${formatCurrency(record.spareCost)}</td>
            </tr>
          `
        )
        .join('')
    : '<tr><td colspan="6">No spare parts records added yet.</td></tr>';
}

function renderPaymentRecords() {
  const records = readData(PAYMENT_KEY);
  paymentRecordsBody.innerHTML = records.length
    ? records
        .map(
          (record) => `
            <tr>
              <td>${record.date}</td>
              <td>${record.clientName}</td>
              <td>${record.receiptNumber}</td>
              <td>${record.serviceItem}</td>
              <td>${formatCurrency(record.amountPaid)}</td>
              <td>${record.paymentMethod}</td>
            </tr>
          `
        )
        .join('')
    : '<tr><td colspan="6">No payment records added yet.</td></tr>';
}

function renderPreviewFromPayment(record) {
  const date = record.date || new Date().toISOString().split('T')[0];
  const generatedAt = new Date().toLocaleString();

  receiptPreview.innerHTML = `
    <div class="receipt">
      <div class="receipt-header">
        <h4>Bultex Electronics Isiolo</h4>
        <strong>Official Receipt</strong>
      </div>
      <div class="receipt-meta">
        <span>Receipt No:</span>
        <strong>${record.receiptNumber}</strong>
        <span>Date:</span>
        <strong>${date}</strong>
        <span>Generated:</span>
        <strong>${generatedAt}</strong>
      </div>
      <div class="receipt-meta">
        <span>Client:</span>
        <strong>${record.clientName}</strong>
        <span>Service:</span>
        <strong>${record.serviceItem}</strong>
        <span>Payment Method:</span>
        <strong>${record.paymentMethod}</strong>
      </div>
      <div class="receipt-row">
        <span>Amount Paid</span>
        <span class="amount">${formatCurrency(record.amountPaid)}</span>
      </div>
      <div class="receipt-row">
        <span>Notes</span>
        <span>${record.paymentNotes || 'N/A'}</span>
      </div>
    </div>
  `;
}

function handleDailySubmit(event) {
  event.preventDefault();
  const record = {
    date: document.getElementById('dailyDate').value,
    technicianName: document.getElementById('technicianName').value.trim(),
    department: document.getElementById('department').value.trim(),
    clientEquipment: document.getElementById('clientEquipment').value.trim(),
    dailyActivity: document.getElementById('dailyActivity').value.trim(),
    workStatus: document.getElementById('workStatus').value,
  };

  const records = readData(DAILY_KEY);
  records.unshift(record);
  saveData(DAILY_KEY, records);
  renderDailyRecords();
  dailyForm.reset();
  document.getElementById('department').value = 'Technical Department';
}

function handleSpareSubmit(event) {
  event.preventDefault();
  const record = {
    date: document.getElementById('spareDate').value,
    issueFixed: document.getElementById('issueFixed').value.trim(),
    spareName: document.getElementById('spareName').value.trim(),
    supplierPhone: document.getElementById('supplierPhone').value.trim(),
    spareSource: document.getElementById('spareSource').value.trim(),
    spareCost: Number(document.getElementById('spareCost').value || 0),
    spareTechnician: document.getElementById('spareTechnician').value.trim(),
  };

  const records = readData(SPARE_KEY);
  records.unshift(record);
  saveData(SPARE_KEY, records);
  renderSpareRecords();
  spareForm.reset();
}

function handlePaymentSubmit(event) {
  event.preventDefault();
  const record = {
    date: document.getElementById('paymentDate').value,
    clientName: document.getElementById('clientName').value.trim(),
    receiptNumber: document.getElementById('receiptNumber').value.trim(),
    serviceItem: document.getElementById('serviceItem').value.trim(),
    amountPaid: Number(document.getElementById('amountPaid').value || 0),
    paymentMethod: document.getElementById('paymentMethod').value,
    paymentNotes: document.getElementById('paymentNotes').value.trim(),
  };

  const records = readData(PAYMENT_KEY);
  records.unshift(record);
  saveData(PAYMENT_KEY, records);
  renderPaymentRecords();
  renderPreviewFromPayment(record);
  paymentForm.reset();
}

function printReceipt() {
  const preview = receiptPreview.innerHTML;
  if (preview.includes('No receipt generated yet')) {
    alert('Generate a receipt before printing.');
    return;
  }
  window.print();
}

dailyForm.addEventListener('submit', handleDailySubmit);
spareForm.addEventListener('submit', handleSpareSubmit);
paymentForm.addEventListener('submit', handlePaymentSubmit);
printReceiptBtn.addEventListener('click', printReceipt);

renderDailyRecords();
renderSpareRecords();
renderPaymentRecords();

document.getElementById('dailyDate').valueAsDate = new Date();
document.getElementById('spareDate').valueAsDate = new Date();
document.getElementById('paymentDate').valueAsDate = new Date();
