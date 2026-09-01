const DAILY_KEY = 'bultexDailyRecords';
const SPARE_KEY = 'bultexSpareRecords';
const PAYMENT_KEY = 'bultexPaymentRecords';
const USERS_KEY = 'bultexUsers';
const SESSION_KEY = 'bultexSession';

let editingRecordType = null;
let editingRecordId = null;

// ===== AUTHENTICATION FUNCTIONS =====

function hashPassword(password) {
  // Simple hash function for demo purposes
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
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
        password: hashPassword('admin123'),
        department: 'Admin',
        createdAt: new Date().toISOString(),
      },
    ];
    saveData(USERS_KEY, defaultUsers);
  }
}

function registerUser(fullName, username, password, department) {
  const users = readData(USERS_KEY);

  // Check if username already exists
  if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
    return { success: false, message: 'Username already exists' };
  }

  // Validate input
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

  // Create session
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

// ===== LOGIN/REGISTER EVENT HANDLERS =====

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
        renderDailyRecords();
        renderSpareRecords();
        renderPaymentRecords();
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

// ===== EXISTING DATA MANAGEMENT FUNCTIONS =====

const dailyForm = document.getElementById('dailyForm');
const spareForm = document.getElementById('spareForm');
const paymentForm = document.getElementById('paymentForm');
const dailyRecordsBody = document.getElementById('dailyRecordsBody');
const spareRecordsBody = document.getElementById('spareRecordsBody');
const paymentRecordsBody = document.getElementById('paymentRecordsBody');
const receiptPreview = document.getElementById('receiptPreview');
const printReceiptBtn = document.getElementById('printReceiptBtn');
const editModal = document.getElementById('editModal');
const modalBody = document.getElementById('modalBody');
const closeModalBtn = document.getElementById('closeModalBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const saveEditBtn = document.getElementById('saveEditBtn');

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

function formatCurrency(value) {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function updateDashboard() {
  const dailyRecords = readData(DAILY_KEY);
  const spareRecords = readData(SPARE_KEY);
  const paymentRecords = readData(PAYMENT_KEY);

  document.getElementById('dailyCount').textContent = dailyRecords.length;
  document.getElementById('spareCount').textContent = spareRecords.length;

  const spareTotalCost = spareRecords.reduce((sum, r) => sum + (r.spareCost || 0), 0);
  document.getElementById('spareTotalCost').textContent = formatCurrency(spareTotalCost);

  const paymentTotal = paymentRecords.reduce((sum, r) => sum + (r.amountPaid || 0), 0);
  document.getElementById('paymentTotal').textContent = formatCurrency(paymentTotal);
}

function renderDailyRecords(filterText = '') {
  const records = readData(DAILY_KEY);
  const filtered = records.filter(r =>
    r.technicianName.toLowerCase().includes(filterText.toLowerCase()) ||
    r.clientEquipment.toLowerCase().includes(filterText.toLowerCase())
  );

  dailyRecordsBody.innerHTML = filtered.length
    ? filtered
        .map(
          (record, index) => `
            <tr>
              <td>${record.date}</td>
              <td>${record.technicianName}</td>
              <td>${record.clientEquipment}</td>
              <td>${record.dailyActivity}</td>
              <td>${record.workStatus}</td>
              <td>
                <div class="action-buttons">
                  <button class="btn-small btn-edit" onclick="openEditModal('daily', '${record.id}')">✏️ Edit</button>
                  <button class="btn-small btn-delete" onclick="deleteRecord('daily', '${record.id}')">🗑️ Delete</button>
                </div>
              </td>
            </tr>
          `
        )
        .join('')
    : '<tr><td colspan="6">No daily records added yet.</td></tr>';
}

function renderSpareRecords(filterText = '') {
  const records = readData(SPARE_KEY);
  const filtered = records.filter(r =>
    r.spareName.toLowerCase().includes(filterText.toLowerCase()) ||
    r.issueFixed.toLowerCase().includes(filterText.toLowerCase())
  );

  spareRecordsBody.innerHTML = filtered.length
    ? filtered
        .map(
          (record) => `
            <tr>
              <td>${record.date}</td>
              <td>${record.issueFixed}</td>
              <td>${record.spareName}</td>
              <td>${record.supplierPhone}</td>
              <td>${record.spareSource}</td>
              <td>${formatCurrency(record.spareCost)}</td>
              <td>
                <div class="action-buttons">
                  <button class="btn-small btn-edit" onclick="openEditModal('spare', '${record.id}')">✏️ Edit</button>
                  <button class="btn-small btn-delete" onclick="deleteRecord('spare', '${record.id}')">🗑️ Delete</button>
                </div>
              </td>
            </tr>
          `
        )
        .join('')
    : '<tr><td colspan="7">No spare parts records added yet.</td></tr>';
}

function renderPaymentRecords(filterText = '') {
  const records = readData(PAYMENT_KEY);
  const filtered = records.filter(r =>
    r.clientName.toLowerCase().includes(filterText.toLowerCase()) ||
    r.receiptNumber.toLowerCase().includes(filterText.toLowerCase())
  );

  paymentRecordsBody.innerHTML = filtered.length
    ? filtered
        .map(
          (record) => `
            <tr>
              <td>${record.date}</td>
              <td>${record.clientName}</td>
              <td>${record.receiptNumber}</td>
              <td>${record.serviceItem}</td>
              <td>${formatCurrency(record.amountPaid)}</td>
              <td>${record.paymentMethod}</td>
              <td>
                <div class="action-buttons">
                  <button class="btn-small btn-edit" onclick="openEditModal('payment', '${record.id}')">✏️ Edit</button>
                  <button class="btn-small btn-delete" onclick="deleteRecord('payment', '${record.id}')">🗑️ Delete</button>
                </div>
              </td>
            </tr>
          `
        )
        .join('')
    : '<tr><td colspan="7">No payment records added yet.</td></tr>';
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

function openEditModal(recordType, recordId) {
  editingRecordType = recordType;
  editingRecordId = recordId;

  const key =
    recordType === 'daily'
      ? DAILY_KEY
      : recordType === 'spare'
        ? SPARE_KEY
        : PAYMENT_KEY;

  const records = readData(key);
  const record = records.find(r => r.id === recordId);

  if (!record) {
    alert('Record not found');
    return;
  }

  let formHTML = '';
  if (recordType === 'daily') {
    formHTML = `
      <label>
        <span>Date</span>
        <input type="date" id="editDate" value="${record.date}" required />
      </label>
      <label>
        <span>Technician Name</span>
        <input type="text" id="editTechnicianName" value="${record.technicianName}" required />
      </label>
      <label>
        <span>Department</span>
        <input type="text" id="editDepartment" value="${record.department}" required />
      </label>
      <label>
        <span>Client / Equipment</span>
        <input type="text" id="editClientEquipment" value="${record.clientEquipment}" required />
      </label>
      <label>
        <span>Activity / Work Done</span>
        <textarea id="editDailyActivity" rows="3" required>${record.dailyActivity}</textarea>
      </label>
      <label>
        <span>Status</span>
        <select id="editWorkStatus" required>
          <option value="Completed" ${record.workStatus === 'Completed' ? 'selected' : ''}>Completed</option>
          <option value="Pending" ${record.workStatus === 'Pending' ? 'selected' : ''}>Pending</option>
          <option value="In Progress" ${record.workStatus === 'In Progress' ? 'selected' : ''}>In Progress</option>
        </select>
      </label>
    `;
  } else if (recordType === 'spare') {
    formHTML = `
      <label>
        <span>Date</span>
        <input type="date" id="editDate" value="${record.date}" required />
      </label>
      <label>
        <span>Issue Fixed</span>
        <input type="text" id="editIssueFixed" value="${record.issueFixed}" required />
      </label>
      <label>
        <span>Spare Part Name</span>
        <input type="text" id="editSpareName" value="${record.spareName}" required />
      </label>
      <label>
        <span>Supplier Phone</span>
        <input type="tel" id="editSupplierPhone" value="${record.supplierPhone}" required />
      </label>
      <label>
        <span>Where Spare Was Gotten</span>
        <input type="text" id="editSpareSource" value="${record.spareSource}" required />
      </label>
      <label>
        <span>Cost (KES)</span>
        <input type="number" id="editSpareCost" min="0" step="0.01" value="${record.spareCost}" required />
      </label>
      <label>
        <span>Technician Name</span>
        <input type="text" id="editSpareTechnician" value="${record.spareTechnician}" required />
      </label>
    `;
  } else if (recordType === 'payment') {
    formHTML = `
      <label>
        <span>Date</span>
        <input type="date" id="editDate" value="${record.date}" required />
      </label>
      <label>
        <span>Client Name</span>
        <input type="text" id="editClientName" value="${record.clientName}" required />
      </label>
      <label>
        <span>Receipt Number</span>
        <input type="text" id="editReceiptNumber" value="${record.receiptNumber}" required />
      </label>
      <label>
        <span>Service / Item</span>
        <input type="text" id="editServiceItem" value="${record.serviceItem}" required />
      </label>
      <label>
        <span>Amount Paid (KES)</span>
        <input type="number" id="editAmountPaid" min="0" step="0.01" value="${record.amountPaid}" required />
      </label>
      <label>
        <span>Payment Method</span>
        <select id="editPaymentMethod" required>
          <option value="Cash" ${record.paymentMethod === 'Cash' ? 'selected' : ''}>Cash</option>
          <option value="Mpesa" ${record.paymentMethod === 'Mpesa' ? 'selected' : ''}>Mpesa</option>
          <option value="Bank Transfer" ${record.paymentMethod === 'Bank Transfer' ? 'selected' : ''}>Bank Transfer</option>
          <option value="Card" ${record.paymentMethod === 'Card' ? 'selected' : ''}>Card</option>
        </select>
      </label>
      <label>
        <span>Payment Notes</span>
        <textarea id="editPaymentNotes" rows="2">${record.paymentNotes || ''}</textarea>
      </label>
    `;
  }

  document.getElementById('modalTitle').textContent = `Edit ${recordType.charAt(0).toUpperCase() + recordType.slice(1)} Record`;
  modalBody.innerHTML = formHTML;
  editModal.classList.add('show');
}

function closeModal() {
  editModal.classList.remove('show');
  editingRecordType = null;
  editingRecordId = null;
}

function saveEditedRecord() {
  if (!editingRecordType || !editingRecordId) return;

  const key =
    editingRecordType === 'daily'
      ? DAILY_KEY
      : editingRecordType === 'spare'
        ? SPARE_KEY
        : PAYMENT_KEY;

  const records = readData(key);
  const index = records.findIndex(r => r.id === editingRecordId);

  if (index === -1) {
    alert('Record not found');
    return;
  }

  let updatedRecord;
  if (editingRecordType === 'daily') {
    updatedRecord = {
      id: editingRecordId,
      date: document.getElementById('editDate').value,
      technicianName: document.getElementById('editTechnicianName').value.trim(),
      department: document.getElementById('editDepartment').value.trim(),
      clientEquipment: document.getElementById('editClientEquipment').value.trim(),
      dailyActivity: document.getElementById('editDailyActivity').value.trim(),
      workStatus: document.getElementById('editWorkStatus').value,
    };
  } else if (editingRecordType === 'spare') {
    updatedRecord = {
      id: editingRecordId,
      date: document.getElementById('editDate').value,
      issueFixed: document.getElementById('editIssueFixed').value.trim(),
      spareName: document.getElementById('editSpareName').value.trim(),
      supplierPhone: document.getElementById('editSupplierPhone').value.trim(),
      spareSource: document.getElementById('editSpareSource').value.trim(),
      spareCost: Number(document.getElementById('editSpareCost').value || 0),
      spareTechnician: document.getElementById('editSpareTechnician').value.trim(),
    };
  } else if (editingRecordType === 'payment') {
    updatedRecord = {
      id: editingRecordId,
      date: document.getElementById('editDate').value,
      clientName: document.getElementById('editClientName').value.trim(),
      receiptNumber: document.getElementById('editReceiptNumber').value.trim(),
      serviceItem: document.getElementById('editServiceItem').value.trim(),
      amountPaid: Number(document.getElementById('editAmountPaid').value || 0),
      paymentMethod: document.getElementById('editPaymentMethod').value,
      paymentNotes: document.getElementById('editPaymentNotes').value.trim(),
    };
  }

  records[index] = updatedRecord;
  saveData(key, records);
  closeModal();

  if (editingRecordType === 'daily') {
    renderDailyRecords();
  } else if (editingRecordType === 'spare') {
    renderSpareRecords();
  } else if (editingRecordType === 'payment') {
    renderPaymentRecords();
  }

  updateDashboard();
  alert('Record updated successfully');
}

function deleteRecord(recordType, recordId) {
  if (!confirm('Are you sure you want to delete this record? This action cannot be undone.')) {
    return;
  }

  const key =
    recordType === 'daily'
      ? DAILY_KEY
      : recordType === 'spare'
        ? SPARE_KEY
        : PAYMENT_KEY;

  const records = readData(key);
  const filtered = records.filter(r => r.id !== recordId);
  saveData(key, filtered);

  if (recordType === 'daily') {
    renderDailyRecords();
  } else if (recordType === 'spare') {
    renderSpareRecords();
  } else if (recordType === 'payment') {
    renderPaymentRecords();
  }

  updateDashboard();
}

function exportToCSV(recordType) {
  const key =
    recordType === 'daily'
      ? DAILY_KEY
      : recordType === 'spare'
        ? SPARE_KEY
        : PAYMENT_KEY;

  const records = readData(key);
  if (!records.length) {
    alert('No records to export');
    return;
  }

  let csv = '';
  if (recordType === 'daily') {
    csv = 'Date,Technician,Department,Client/Equipment,Activity,Status\n';
    csv += records
      .map(
        r =>
          `"${r.date}","${r.technicianName}","${r.department}","${r.clientEquipment}","${r.dailyActivity}","${r.workStatus}"`
      )
      .join('\n');
  } else if (recordType === 'spare') {
    csv = 'Date,Issue Fixed,Spare Name,Supplier Phone,Source,Cost (KES),Technician\n';
    csv += records
      .map(
        r =>
          `"${r.date}","${r.issueFixed}","${r.spareName}","${r.supplierPhone}","${r.spareSource}","${r.spareCost}","${r.spareTechnician}"`
      )
      .join('\n');
  } else if (recordType === 'payment') {
    csv = 'Date,Client Name,Receipt Number,Service/Item,Amount (KES),Payment Method,Notes\n';
    csv += records
      .map(
        r =>
          `"${r.date}","${r.clientName}","${r.receiptNumber}","${r.serviceItem}","${r.amountPaid}","${r.paymentMethod}","${r.paymentNotes}"`
      )
      .join('\n');
  }

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `bultex-${recordType}-records-${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function exportAllToCSV() {
  const date = new Date().toISOString().split('T')[0];
  const dailyRecords = readData(DAILY_KEY);
  const spareRecords = readData(SPARE_KEY);
  const paymentRecords = readData(PAYMENT_KEY);

  let csv =
    '=== BULTEX ELECTRONICS ISIOLO EXPORT ===\nGenerated: ' +
    new Date().toLocaleString() +
    '\n\n';

  // Daily Records
  csv += '--- DAILY WORK RECORDS ---\n';
  csv += 'Date,Technician,Department,Client/Equipment,Activity,Status\n';
  csv += dailyRecords
    .map(
      r =>
        `"${r.date}","${r.technicianName}","${r.department}","${r.clientEquipment}","${r.dailyActivity}","${r.workStatus}"`
    )
    .join('\n');

  csv += '\n\n--- SPARE PARTS RECORDS ---\n';
  csv += 'Date,Issue Fixed,Spare Name,Supplier Phone,Source,Cost (KES),Technician\n';
  csv += spareRecords
    .map(
      r =>
        `"${r.date}","${r.issueFixed}","${r.spareName}","${r.supplierPhone}","${r.spareSource}","${r.spareCost}","${r.spareTechnician}"`
    )
    .join('\n');

  csv += '\n\n--- PAYMENT RECORDS ---\n';
  csv += 'Date,Client Name,Receipt Number,Service/Item,Amount (KES),Payment Method,Notes\n';
  csv += paymentRecords
    .map(
      r =>
        `"${r.date}","${r.clientName}","${r.receiptNumber}","${r.serviceItem}","${r.amountPaid}","${r.paymentMethod}","${r.paymentNotes}"`
    )
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `bultex-complete-export-${date}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function handleDailySubmit(event) {
  event.preventDefault();
  const record = {
    id: generateId(),
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
  document.getElementById('dailyDate').valueAsDate = new Date();
  updateDashboard();
}

function handleSpareSubmit(event) {
  event.preventDefault();
  const record = {
    id: generateId(),
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
  document.getElementById('spareDate').valueAsDate = new Date();
  updateDashboard();
}

function handlePaymentSubmit(event) {
  event.preventDefault();
  const record = {
    id: generateId(),
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
  document.getElementById('paymentDate').valueAsDate = new Date();
  updateDashboard();
}

function printReceipt() {
  const preview = receiptPreview.innerHTML;
  if (preview.includes('No receipt generated yet')) {
    alert('Generate a receipt before printing.');
    return;
  }
  window.print();
}

// Event Listeners
dailyForm.addEventListener('submit', handleDailySubmit);
spareForm.addEventListener('submit', handleSpareSubmit);
paymentForm.addEventListener('submit', handlePaymentSubmit);
printReceiptBtn.addEventListener('click', printReceipt);

closeModalBtn.addEventListener('click', closeModal);
cancelEditBtn.addEventListener('click', closeModal);
saveEditBtn.addEventListener('click', saveEditedRecord);

document.getElementById('dailyFilter').addEventListener('input', e => renderDailyRecords(e.target.value));
document.getElementById('spareFilter').addEventListener('input', e => renderSpareRecords(e.target.value));
document.getElementById('paymentFilter').addEventListener('input', e => renderPaymentRecords(e.target.value));

document.getElementById('exportDailyBtn').addEventListener('click', () => exportToCSV('daily'));
document.getElementById('exportSpareBtn').addEventListener('click', () => exportToCSV('spare'));
document.getElementById('exportPaymentBtn').addEventListener('click', () => exportToCSV('payment'));
document.getElementById('exportAllBtn').addEventListener('click', exportAllToCSV);

document.getElementById('clearAllBtn').addEventListener('click', () => {
  if (confirm('⚠️ This will DELETE ALL DATA! This action cannot be undone. Type "DELETE ALL" to confirm.')) {
    const userInput = prompt('Type "DELETE ALL" to confirm:');
    if (userInput === 'DELETE ALL') {
      localStorage.removeItem(DAILY_KEY);
      localStorage.removeItem(SPARE_KEY);
      localStorage.removeItem(PAYMENT_KEY);
      renderDailyRecords();
      renderSpareRecords();
      renderPaymentRecords();
      updateDashboard();
      alert('All data has been deleted');
    }
  }
});

// Close modal when clicking outside
window.addEventListener('click', event => {
  if (event.target === editModal) {
    closeModal();
  }
});

// ===== INITIALIZATION =====

// Initialize default users on first load
initializeDefaultUsers();

// Setup authentication events
setupAuthEvents();

// Check authentication status
checkAuth();

// Only load records if authenticated
const currentUser = getCurrentUser();
if (currentUser) {
  renderDailyRecords();
  renderSpareRecords();
  renderPaymentRecords();
  updateDashboard();

  document.getElementById('dailyDate').valueAsDate = new Date();
  document.getElementById('spareDate').valueAsDate = new Date();
  document.getElementById('paymentDate').valueAsDate = new Date();
}
