const DAILY_KEY = 'bultexDailyRecords';
const SPARE_KEY = 'bultexSpareRecords';
const PAYMENT_KEY = 'bultexPaymentRecords';
const COMBINED_KEY = 'bultexCombinedRecords';
const USERS_KEY = 'bultexUsers';
const SESSION_KEY = 'bultexSession';

let editingRecordId = null;

// ===== AUTHENTICATION FUNCTIONS =====

function hashPassword(password) {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

function initializeDefaultUsers() {
  const existingUsers = readData(USERS_KEY);
  if (existingUsers.length === 0) {
    const defaultUsers = [
      {
        id: generateId(),
        name: 'Administrator',
        username: 'admin',
        password: hashPassword('cruise1601'),
        department: 'Admin',
        createdAt: new Date().toISOString(),
      },
    ];
    saveData(USERS_KEY, defaultUsers);
    return;
  }

  const adminUser = existingUsers.find(user => user.username && user.username.toLowerCase() === 'admin');
  if (adminUser && adminUser.password !== hashPassword('cruise1601')) {
    adminUser.password = hashPassword('cruise1601');
    saveData(USERS_KEY, existingUsers);
  }
}

function registerUser(fullName, username, password, department) {
  const users = readData(USERS_KEY);
  if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
    return { success: false, message: 'Username already exists' };
  }
  if (!fullName || !username || !password || !department) {
    return { success: false, message: 'All fields are required' };
  }
  if (password.length < 6) {
    return { success: false, message: 'Password must be at least 6 characters' };
  }
  const newUser = {
    id: generateId(),
    name: fullName,
    username: username.toLowerCase(),
    password: hashPassword(password),
    department: department,
    createdAt: new Date().toISOString(),
  };
  users.push(newUser);
  saveData(USERS_KEY, users);
  return { success: true, message: 'Account created successfully' };
}

function loginUser(username, password) {
  const users = readData(USERS_KEY);
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) {
    return { success: false, message: 'Username or password incorrect' };
  }
  const hashedPassword = hashPassword(password);
  if (user.password !== hashedPassword) {
    return { success: false, message: 'Username or password incorrect' };
  }
  const session = {
    userId: user.id,
    username: user.username,
    name: user.name,
    department: user.department,
    loginTime: new Date().toISOString(),
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return { success: true, message: 'Login successful', user };
}

function getCurrentUser() {
  const session = sessionStorage.getItem(SESSION_KEY);
  return session ? JSON.parse(session) : null;
}

function logoutUser() {
  sessionStorage.removeItem(SESSION_KEY);
}

function showLoginPage() {
  const loginPage = document.getElementById('loginPage');
  const appContainer = document.getElementById('appContainer');
  loginPage.classList.add('show');
  loginPage.classList.remove('hidden');
  appContainer.classList.add('hidden');
  appContainer.classList.remove('show');
}

function showApp() {
  const loginPage = document.getElementById('loginPage');
  const appContainer = document.getElementById('appContainer');
  loginPage.classList.remove('show');
  loginPage.classList.add('hidden');
  appContainer.classList.remove('hidden');
  appContainer.classList.add('show');
  const currentUser = getCurrentUser();
  if (currentUser) {
    document.getElementById('userGreeting').textContent = `Welcome, ${currentUser.name}!`;
  }
}

function checkAuth() {
  const currentUser = getCurrentUser();
  if (!currentUser) {
    showLoginPage();
  } else {
    showApp();
  }
}

function setupAuthEvents() {
  const loginFormElement = document.getElementById('loginFormElement');
  const registerFormElement = document.getElementById('registerFormElement');
  const showRegisterBtn = document.getElementById('showRegisterBtn');
  const showLoginBtn = document.getElementById('showLoginBtn');
  const logoutBtn = document.getElementById('logoutBtn');

  if (loginFormElement) {
    loginFormElement.addEventListener('submit', e => {
      e.preventDefault();
      const username = document.getElementById('loginUsername').value.trim();
      const password = document.getElementById('loginPassword').value;
      const result = loginUser(username, password);
      if (result.success) {
        showApp();
        renderRecords();
        updateDashboard();
        loginFormElement.reset();
      } else {
        alert(result.message);
      }
    });
  }

  if (registerFormElement) {
    registerFormElement.addEventListener('submit', e => {
      e.preventDefault();
      const fullName = document.getElementById('registerName').value.trim();
      const username = document.getElementById('registerUsername').value.trim();
      const password = document.getElementById('registerPassword').value;
      const confirmPassword = document.getElementById('registerConfirm').value;
      const department = document.getElementById('registerDept').value;
      if (password !== confirmPassword) {
        alert('Passwords do not match');
        return;
      }
      const result = registerUser(fullName, username, password, department);
      if (result.success) {
        alert(result.message + '\nPlease login with your new account.');
        document.getElementById('loginForm').classList.remove('hidden');
        document.getElementById('registerForm').classList.add('hidden');
        registerFormElement.reset();
      } else {
        alert(result.message);
      }
    });
  }

  if (showRegisterBtn) {
    showRegisterBtn.addEventListener('click', e => {
      e.preventDefault();
      document.getElementById('loginForm').classList.add('hidden');
      document.getElementById('registerForm').classList.remove('hidden');
    });
  }

  if (showLoginBtn) {
    showLoginBtn.addEventListener('click', e => {
      e.preventDefault();
      document.getElementById('loginForm').classList.remove('hidden');
      document.getElementById('registerForm').classList.add('hidden');
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to logout?')) {
        logoutUser();
        showLoginPage();
        document.getElementById('loginFormElement').reset();
        document.getElementById('registerFormElement').reset();
      }
    });
  }
}

// ===== DATA MANAGEMENT =====

function generateId() {
  return Date.now() + Math.random().toString(36).substr(2, 9);
}

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

function migrateLegacyRecords() {
  const combinedRecords = readData(COMBINED_KEY);
  if (combinedRecords.length > 0) {
    return;
  }

  const legacyKeys = [DAILY_KEY, SPARE_KEY, PAYMENT_KEY];
  const merged = [];

  legacyKeys.forEach(key => {
    const records = readData(key);
    records.forEach(record => {
      if (!record || typeof record !== 'object') return;
      merged.push({
        id: record.id || generateId(),
        date: record.date || record.createdAt || new Date().toISOString().slice(0, 10),
        clientEquipment: record.clientEquipment || record.client || record.equipment || 'Unknown Client',
        activity: record.activity || record.workDone || record.description || 'No description',
        workStatus: record.workStatus || record.status || 'Completed',
        issueFixed: record.issueFixed || '',
        spareName: record.spareName || record.deviceName || '',
        spareSource: record.spareSource || '',
        spareCost: Number(record.spareCost || 0),
        receiptNumber: record.receiptNumber || '',
        serviceItem: record.serviceItem || record.item || '',
        amountPaid: Number(record.amountPaid || 0),
        paymentMethod: record.paymentMethod || '',
        paymentNotes: record.paymentNotes || '',
      });
    });
  });

  if (merged.length > 0) {
    saveData(COMBINED_KEY, merged);
  }
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function generateReceiptNumber() {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(Math.random() * 10000);
  return `RCP-${dateStr}-${String(random).padStart(4, '0')}`;
}

// Get DOM elements with safe defaults
const getElement = (id) => document.getElementById(id);
let combinedForm, recordsBody, receiptPreview, printReceiptBtn, editModal, modalBody, closeModalBtn, cancelEditBtn, saveEditBtn;

function initializeDOMElements() {
  combinedForm = getElement('combinedForm');
  recordsBody = getElement('recordsBody');
  receiptPreview = getElement('receiptPreview');
  printReceiptBtn = getElement('printReceiptBtn');
  editModal = getElement('editModal');
  modalBody = getElement('modalBody');
  closeModalBtn = getElement('closeModalBtn');
  cancelEditBtn = getElement('cancelEditBtn');
  saveEditBtn = getElement('saveEditBtn');
}

function getMonthKey(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getSelectedMonthValue() {
  const monthFilter = document.getElementById('monthFilter');
  return monthFilter ? monthFilter.value : 'all';
}

function filterRecordsByMonth(records, monthValue = 'all') {
  if (!monthValue || monthValue === 'all') return records;
  return records.filter(record => getMonthKey(record.date) === monthValue);
}

function populateMonthFilterOptions() {
  const monthFilter = document.getElementById('monthFilter');
  if (!monthFilter) return;

  const records = readData(COMBINED_KEY);
  const months = new Set();
  records.forEach(record => {
    const monthKey = getMonthKey(record.date);
    if (monthKey) months.add(monthKey);
  });

  const currentMonth = new Date();
  const currentMonthKey = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`;
  if (!months.has(currentMonthKey)) months.add(currentMonthKey);

  const orderedMonths = Array.from(months).sort().reverse();
  const options = ['<option value="all">All records</option>'];
  orderedMonths.forEach(monthKey => {
    const [year, month] = monthKey.split('-');
    const label = new Date(Number(year), Number(month) - 1, 1).toLocaleString('en-US', {
      month: 'long',
      year: 'numeric',
    });
    options.push(`<option value="${monthKey}">${label}</option>`);
  });

  monthFilter.innerHTML = options.join('');
  monthFilter.value = monthFilter.value || 'all';
  if (!Array.from(monthFilter.options).some(option => option.value === monthFilter.value)) {
    monthFilter.value = 'all';
  }
}

function updateDashboard() {
  const records = readData(COMBINED_KEY);
  const monthValue = getSelectedMonthValue();
  const visibleRecords = filterRecordsByMonth(records, monthValue);
  const totalIncome = visibleRecords.reduce((sum, r) => sum + (r.amountPaid || 0), 0);
  const totalExpenditure = visibleRecords.reduce((sum, r) => sum + (r.spareCost || 0), 0);
  const totalProfit = totalIncome - totalExpenditure;

  document.getElementById('dailyCount').textContent = visibleRecords.length;
  document.getElementById('spareCount').textContent = visibleRecords.filter(r => r.spareName).length;
  document.getElementById('spareTotalCost').textContent = formatCurrency(totalExpenditure);
  document.getElementById('paymentTotal').textContent = formatCurrency(totalIncome);
  document.getElementById('totalProfit').textContent = formatCurrency(totalProfit);
}

function renderRecords(filterText = '') {
  const records = readData(COMBINED_KEY);
  const monthValue = getSelectedMonthValue();
  const monthFiltered = filterRecordsByMonth(records, monthValue);
  const filtered = monthFiltered.filter(r =>
    (r.clientEquipment || '').toLowerCase().includes(filterText.toLowerCase()) ||
    (r.date || '').includes(filterText)
  );

  recordsBody.innerHTML = filtered.length
    ? filtered
        .map(
          (record) => `
            <tr>
              <td>${record.date}</td>
              <td>${record.clientEquipment}</td>
              <td>${record.activity}</td>
              <td>${record.workStatus}</td>
              <td>${record.spareName ? record.spareName + ' - ' + formatCurrency(record.spareCost) : '-'}</td>
              <td>${record.receiptNumber ? formatCurrency(record.amountPaid) + ' (' + record.paymentMethod + ')' : '-'}</td>
              <td>
                <div class="action-buttons">
                  <button class="btn-small btn-edit" onclick="openEditModal('${record.id}')">✏️ Edit</button>
                  <button class="btn-small btn-delete" onclick="deleteRecord('${record.id}')">🗑️ Delete</button>
                </div>
              </td>
            </tr>
          `
        )
        .join('')
    : '<tr><td colspan="7">No records added yet.</td></tr>';
}

function renderPreviewFromRecord(record) {
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
        <strong>${record.receiptNumber || 'N/A'}</strong>
        <span>Date:</span>
        <strong>${date}</strong>
        <span>Generated:</span>
        <strong>${generatedAt}</strong>
      </div>
      <div class="receipt-meta">
        <span>Client:</span>
        <strong>${record.clientEquipment}</strong>
        <span>Service:</span>
        <strong>${record.serviceItem || record.activity}</strong>
        <span>Payment Method:</span>
        <strong>${record.paymentMethod || 'N/A'}</strong>
      </div>
      <div class="receipt-row">
        <span>Amount Paid</span>
        <span class="amount">${formatCurrency(record.amountPaid || 0)}</span>
      </div>
      <div class="receipt-row">
        <span>Notes</span>
        <span>${record.paymentNotes || 'N/A'}</span>
      </div>
    </div>
  `;
}

function openEditModal(recordId) {
  editingRecordId = recordId;
  const records = readData(COMBINED_KEY);
  const record = records.find(r => r.id === recordId);

  if (!record) {
    alert('Record not found');
    return;
  }

  const formHTML = `
    <label>
      <span>Date</span>
      <input type="date" id="editDate" value="${record.date}" required />
    </label>
    <label>
      <span>Client / Equipment</span>
      <input type="text" id="editClientEquipment" value="${record.clientEquipment}" required />
    </label>
    <label class="full-width">
      <span>Activity / Work Done</span>
      <textarea id="editActivity" rows="2" required>${record.activity}</textarea>
    </label>
    <label>
      <span>Status</span>
      <select id="editWorkStatus" required>
        <option value="Completed" ${record.workStatus === 'Completed' ? 'selected' : ''}>Completed</option>
        <option value="Pending" ${record.workStatus === 'Pending' ? 'selected' : ''}>Pending</option>
        <option value="In Progress" ${record.workStatus === 'In Progress' ? 'selected' : ''}>In Progress</option>
      </select>
    </label>
    <hr class="form-divider" />
    <h3>Spare Parts (Optional)</h3>
    <label>
      <span>Issue Fixed</span>
      <input type="text" id="editIssueFixed" value="${record.issueFixed || ''}" />
    </label>
    <label>
      <span>Device Type</span>
      <select id="editSpareName">
        <option value="">-- Select Device --</option>
        <option value="iPhone" ${record.spareName === 'iPhone' ? 'selected' : ''}>iPhone</option>
        <option value="Android Phone" ${record.spareName === 'Android Phone' ? 'selected' : ''}>Android Phone</option>
        <option value="PlayStation 4" ${record.spareName === 'PlayStation 4' ? 'selected' : ''}>PlayStation 4</option>
        <option value="PlayStation 5" ${record.spareName === 'PlayStation 5' ? 'selected' : ''}>PlayStation 5</option>
        <option value="PS4 Controller" ${record.spareName === 'PS4 Controller' ? 'selected' : ''}>PS4 Controller</option>
        <option value="PS5 Controller" ${record.spareName === 'PS5 Controller' ? 'selected' : ''}>PS5 Controller</option>
        <option value="Laptop" ${record.spareName === 'Laptop' ? 'selected' : ''}>Laptop</option>
        <option value="Desktop PC" ${record.spareName === 'Desktop PC' ? 'selected' : ''}>Desktop PC</option>
        <option value="Other" ${record.spareName === 'Other' ? 'selected' : ''}>Other</option>
      </select>
    </label>
    <label class="full-width">
      <span>Where Spare Was Gotten</span>
      <input type="text" id="editSpareSource" value="${record.spareSource || ''}" />
    </label>
    <label>
      <span>Cost (KES)</span>
      <input type="number" id="editSpareCost" min="0" step="0.01" value="${record.spareCost || 0}" />
    </label>
    <hr class="form-divider" />
    <h3>Payment (Optional)</h3>
    <label>
      <span>Receipt Number</span>
      <input type="text" id="editReceiptNumber" value="${record.receiptNumber || ''}" />
    </label>
    <label>
      <span>Service / Item</span>
      <input type="text" id="editServiceItem" value="${record.serviceItem || ''}" />
    </label>
    <label>
      <span>Amount Paid (KES)</span>
      <input type="number" id="editAmountPaid" min="0" step="0.01" value="${record.amountPaid || 0}" />
    </label>
    <label>
      <span>Payment Method</span>
      <select id="editPaymentMethod">
        <option value="">-- Select --</option>
        <option value="Cash" ${record.paymentMethod === 'Cash' ? 'selected' : ''}>Cash</option>
        <option value="Mpesa" ${record.paymentMethod === 'Mpesa' ? 'selected' : ''}>Mpesa</option>
        <option value="Bank Transfer" ${record.paymentMethod === 'Bank Transfer' ? 'selected' : ''}>Bank Transfer</option>
        <option value="Card" ${record.paymentMethod === 'Card' ? 'selected' : ''}>Card</option>
      </select>
    </label>
    <label class="full-width">
      <span>Payment Notes</span>
      <textarea id="editPaymentNotes" rows="2">${record.paymentNotes || ''}</textarea>
    </label>
  `;

  document.getElementById('modalTitle').textContent = 'Edit Record';
  modalBody.innerHTML = formHTML;
  editModal.classList.add('show');
}

function closeModal() {
  editModal.classList.remove('show');
  editingRecordId = null;
}

function saveEditedRecord() {
  if (!editingRecordId) return;
  const records = readData(COMBINED_KEY);
  const index = records.findIndex(r => r.id === editingRecordId);

  if (index === -1) {
    alert('Record not found');
    return;
  }

  const updatedRecord = {
    id: editingRecordId,
    date: document.getElementById('editDate').value,
    clientEquipment: document.getElementById('editClientEquipment').value.trim(),
    activity: document.getElementById('editActivity').value.trim(),
    workStatus: document.getElementById('editWorkStatus').value,
    issueFixed: document.getElementById('editIssueFixed').value.trim(),
    spareName: document.getElementById('editSpareName').value.trim() || '',
    spareSource: document.getElementById('editSpareSource').value.trim(),
    spareCost: Number(document.getElementById('editSpareCost').value || 0),
    receiptNumber: document.getElementById('editReceiptNumber').value.trim() || '',
    serviceItem: document.getElementById('editServiceItem').value.trim(),
    amountPaid: Number(document.getElementById('editAmountPaid').value || 0),
    paymentMethod: document.getElementById('editPaymentMethod').value || '',
    paymentNotes: document.getElementById('editPaymentNotes').value.trim(),
  };

  records[index] = updatedRecord;
  saveData(COMBINED_KEY, records);
  closeModal();
  renderRecords();
  updateDashboard();
  alert('Record updated successfully');
}

function deleteRecord(recordId) {
  if (!confirm('Are you sure you want to delete this record? This action cannot be undone.')) {
    return;
  }
  const records = readData(COMBINED_KEY);
  const filtered = records.filter(r => r.id !== recordId);
  saveData(COMBINED_KEY, filtered);
  renderRecords();
  updateDashboard();
}

function exportToCSV() {
  const records = readData(COMBINED_KEY);
  if (!records.length) {
    alert('No records to export');
    return;
  }

  const csv =
    'Date,Client/Equipment,Activity,Status,Spare Part,Cost,Receipt,Amount Paid,Payment Method,Notes\n' +
    records
      .map(
        r =>
          `"${r.date}","${r.clientEquipment}","${r.activity}","${r.workStatus}","${r.spareName || ''}","${r.spareCost || ''}","${r.receiptNumber || ''}","${r.amountPaid || ''}","${r.paymentMethod || ''}","${r.paymentNotes || ''}"`
      )
      .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute(
    'download',
    `bultex-records-${new Date().toISOString().split('T')[0]}.csv`
  );
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function handleCombinedSubmit(event) {
  event.preventDefault();
  const amountPaid = Number(document.getElementById('amountPaid').value || 0);
  const receiptNumberField = document.getElementById('receiptNumber');
  
  // Auto-generate receipt number if payment is being recorded
  let receiptNumber = receiptNumberField.value.trim();
  if (amountPaid > 0 && !receiptNumber) {
    receiptNumber = generateReceiptNumber();
    receiptNumberField.value = receiptNumber;
  }
  
  const record = {
    id: generateId(),
    date: document.getElementById('recordDate').value,
    clientEquipment: document.getElementById('clientEquipment').value.trim(),
    activity: document.getElementById('activity').value.trim(),
    workStatus: document.getElementById('workStatus').value,
    issueFixed: document.getElementById('issueFixed').value.trim(),
    spareName: document.getElementById('spareName').value.trim() || '',
    spareSource: document.getElementById('spareSource').value.trim(),
    spareCost: Number(document.getElementById('spareCost').value || 0),
    receiptNumber: receiptNumber,
    serviceItem: document.getElementById('serviceItem').value.trim(),
    amountPaid: amountPaid,
    paymentMethod: document.getElementById('paymentMethod').value,
    paymentNotes: document.getElementById('paymentNotes').value.trim(),
  };

  const records = readData(COMBINED_KEY);
  records.unshift(record);
  saveData(COMBINED_KEY, records);
  renderRecords();
  updateDashboard();

  // Show receipt if payment was recorded
  if (record.amountPaid > 0) {
    renderPreviewFromRecord(record);
  }

  combinedForm.reset();
  document.getElementById('recordDate').valueAsDate = new Date();
}

function printReceipt() {
  const preview = receiptPreview.innerHTML;
  if (preview.includes('No receipt generated yet')) {
    alert('Generate a receipt before printing.');
    return;
  }
  window.print();
}

function copyReceipt() {
  const preview = receiptPreview.innerHTML;
  if (preview.includes('No receipt generated yet')) {
    alert('Generate a receipt before copying.');
    return;
  }
  
  const text = receiptPreview.innerText;
  navigator.clipboard.writeText(text).then(() => {
    const btn = getElement('copyReceiptBtn');
    const originalText = btn.textContent;
    btn.textContent = '✓ Copied!';
    setTimeout(() => {
      btn.textContent = originalText;
    }, 2000);
  }).catch(err => {
    alert('Failed to copy receipt');
  });
}

// ===== EVENT LISTENERS =====

function setupFormEvents() {
  if (combinedForm) combinedForm.addEventListener('submit', handleCombinedSubmit);
  if (printReceiptBtn) printReceiptBtn.addEventListener('click', printReceipt);
  const copyReceiptBtn = getElement('copyReceiptBtn');
  if (copyReceiptBtn) copyReceiptBtn.addEventListener('click', copyReceipt);
  if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
  if (cancelEditBtn) cancelEditBtn.addEventListener('click', closeModal);
  if (saveEditBtn) saveEditBtn.addEventListener('click', saveEditedRecord);

  const recordFilter = getElement('recordFilter');
  const monthFilter = getElement('monthFilter');
  const exportRecordsBtn = getElement('exportRecordsBtn');
  const clearAllBtn = getElement('clearAllBtn');

  if (recordFilter) recordFilter.addEventListener('input', e => renderRecords(e.target.value));
  if (monthFilter) monthFilter.addEventListener('change', () => {
    renderRecords(recordFilter ? recordFilter.value : '');
    updateDashboard();
  });
  if (exportRecordsBtn) exportRecordsBtn.addEventListener('click', exportToCSV);

  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', () => {
      if (confirm('⚠️ This will DELETE ALL DATA! This action cannot be undone. Type "DELETE ALL" to confirm.')) {
        const userInput = prompt('Type "DELETE ALL" to confirm:');
        if (userInput === 'DELETE ALL') {
          localStorage.removeItem(COMBINED_KEY);
          renderRecords();
          updateDashboard();
          populateMonthFilterOptions();
          alert('All data has been deleted');
        }
      }
    });
  }

  if (editModal) {
    window.addEventListener('click', event => {
      if (event.target === editModal) {
        closeModal();
      }
    });
  }
}

// ===== INITIALIZATION =====

initializeDOMElements();
migrateLegacyRecords();
initializeDefaultUsers();
setupAuthEvents();
setupFormEvents();
populateMonthFilterOptions();
checkAuth();

const currentUser = getCurrentUser();
if (currentUser) {
  renderRecords();
  updateDashboard();
  const dateInput = getElement('recordDate');
  if (dateInput) dateInput.valueAsDate = new Date();
}
