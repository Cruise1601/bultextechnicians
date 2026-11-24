const COMBINED_KEY = 'baltexCombinedRecords';

let editingRecordId = null;
let editingProductId = null;
let currentUser = null;
let combinedRecords = [];
let inventoryProducts = [];
let inventoryTransactions = [];
let supabaseClient = null;
let supabaseSetupError = null;
let passwordRecovery = false;
let scannerSessionId = 0;
let html5QrCode = null;
let scannerTarget = null;

try {
  const config = window.BULTEX_SUPABASE_CONFIG;
  if (!window.supabase || !window.supabase.createClient) {
    throw new Error('Supabase client failed to load. Check your internet connection and reload.');
  }
  if (!config || !config.url || config.url.includes('YOUR_PROJECT_ID') ||
      !config.publishableKey || config.publishableKey.includes('YOUR_SUPABASE_')) {
    throw new Error('Add your Supabase project URL and publishable key in supabase-config.js.');
  }
  supabaseClient = window.supabase.createClient(config.url, config.publishableKey);
} catch (error) {
  supabaseSetupError = error;
}

function getSupabaseClient() {
  if (!supabaseClient) throw supabaseSetupError || new Error('Supabase is not configured.');
  return supabaseClient;
}

async function mapAuthUser(user) {
  const metadata = user.user_metadata || {};
  const { data: profile, error } = await getSupabaseClient()
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (error) throw error;
  return {
    id: user.id,
    name: metadata.name || metadata.username || user.email,
    email: user.email,
    department: metadata.department || '',
    role: profile.role,
  };
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
  if (currentUser) {
    document.getElementById('userGreeting').textContent = `Welcome, ${currentUser.name}!`;
  }
  const sectionNav = getElement('sectionNav');
  if (currentUser && currentUser.role === 'shop_admin') {
    sectionNav.classList.remove('hidden');
  } else {
    sectionNav.classList.add('hidden');
  }
  showAppSection('technician');
}

function showAppSection(section) {
  const canManageShop = currentUser && currentUser.role === 'shop_admin';
  const selectedSection = section === 'shop' && canManageShop ? 'shop' : 'technician';
  getElement('technicianSection').classList.toggle('hidden', selectedSection !== 'technician');
  getElement('shopSection').classList.toggle('hidden', selectedSection !== 'shop');
  document.querySelectorAll('.section-nav-button').forEach(button => {
    button.classList.toggle('active', button.dataset.section === selectedSection);
  });
  if (selectedSection === 'shop') {
    loadInventoryData().catch(error => alert(error.message));
  }
}

async function loadAppData() {
  const { data, error } = await getSupabaseClient()
    .from('records')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  combinedRecords = data.map(recordFromDatabase);
  populateMonthFilterOptions();
  renderRecords();
  updateDashboard();
  renderSummaryReview();
  const dateInput = getElement('recordDate');
  if (dateInput) dateInput.valueAsDate = new Date();
}

async function checkAuth() {
  let session;
  try {
    const { data, error } = await getSupabaseClient().auth.getSession();
    if (error) throw error;
    session = data.session;
  } catch (error) {
    currentUser = null;
    showLoginPage();
    alert(error.message);
    return;
  }

  if (!session) {
    currentUser = null;
    showLoginPage();
    return;
  }
  if (passwordRecovery) {
    showPasswordRecoveryForm();
    return;
  }

  try {
    currentUser = await mapAuthUser(session.user);
  } catch (error) {
    currentUser = null;
    showLoginPage();
    alert(error.message);
    return;
  }
  showApp();
  try {
    await loadAppData();
  } catch (error) {
    alert(error.message);
  }
}

function setupAuthEvents() {
  const loginFormElement = document.getElementById('loginFormElement');
  const registerFormElement = document.getElementById('registerFormElement');
  const resetFormElement = document.getElementById('resetFormElement');
  const showRegisterBtn = document.getElementById('showRegisterBtn');
  const showLoginBtn = document.getElementById('showLoginBtn');
  const showResetBtn = document.getElementById('showResetBtn');
  const showLoginFromResetBtn = document.getElementById('showLoginFromResetBtn');
  const logoutBtn = document.getElementById('logoutBtn');

  if (loginFormElement) {
    loginFormElement.addEventListener('submit', async e => {
      e.preventDefault();
      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value;
      try {
        const { data, error } = await getSupabaseClient().auth.signInWithPassword({ email, password });
        if (error) throw error;
        currentUser = await mapAuthUser(data.user);
        showApp();
        await loadAppData();
        loginFormElement.reset();
      } catch (error) {
        alert(error.message);
      }
    });
  }

  if (resetFormElement) {
    resetFormElement.addEventListener('submit', async e => {
      e.preventDefault();
      try {
        if (passwordRecovery) {
          const newPassword = document.getElementById('resetNewPassword').value;
          const confirmPassword = document.getElementById('resetConfirmPassword').value;
          if (newPassword.length < 8) {
            alert('Password must be at least 8 characters');
            return;
          }
          if (newPassword !== confirmPassword) {
            alert('New passwords do not match');
            return;
          }
          const { error } = await getSupabaseClient().auth.updateUser({ password: newPassword });
          if (error) throw error;
          const { error: signOutError } = await getSupabaseClient().auth.signOut();
          if (signOutError) throw signOutError;
          passwordRecovery = false;
          resetFormElement.reset();
          showLoginForm();
          alert('Password updated. Sign in with your new password.');
        } else {
          const email = document.getElementById('resetEmail').value.trim();
          const redirectTo = `${window.location.origin}${window.location.pathname}`;
          const { error } = await getSupabaseClient().auth.resetPasswordForEmail(email, { redirectTo });
          if (error) throw error;
          alert('If an account exists for that email, a password reset link has been sent.');
          resetFormElement.reset();
        }
      } catch (error) {
        alert(error.message);
      }
    });
  }

  if (registerFormElement) {
    registerFormElement.addEventListener('submit', async e => {
      e.preventDefault();
      const fullName = document.getElementById('registerName').value.trim();
      const username = document.getElementById('registerUsername').value.trim();
      const email = document.getElementById('registerEmail').value.trim();
      const password = document.getElementById('registerPassword').value;
      const confirmPassword = document.getElementById('registerConfirm').value;
      if (password !== confirmPassword) {
        alert('Passwords do not match');
        return;
      }
      try {
        const { data, error } = await getSupabaseClient().auth.signUp({
          email,
          password,
          options: {
            data: { name: fullName, username, department: 'Technical' },
            emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
          },
        });
        if (error) throw error;
        registerFormElement.reset();
        if (data.session) {
          currentUser = await mapAuthUser(data.user);
          showApp();
          await loadAppData();
        } else {
          alert('Account created. Check your email to confirm it, then sign in.');
          showLoginForm();
        }
      } catch (error) {
        alert(error.message);
      }
    });
  }

  if (showRegisterBtn) {
    showRegisterBtn.addEventListener('click', e => {
      e.preventDefault();
      document.getElementById('loginForm').classList.add('hidden');
      document.getElementById('registerForm').classList.remove('hidden');
      document.getElementById('resetPasswordForm').classList.add('hidden');
    });
  }

  if (showResetBtn) {
    showResetBtn.addEventListener('click', e => {
      e.preventDefault();
      showPasswordResetRequest();
      document.getElementById('loginForm').classList.add('hidden');
      document.getElementById('resetPasswordForm').classList.remove('hidden');
      document.getElementById('registerForm').classList.add('hidden');
    });
  }

  if (showLoginBtn) {
    showLoginBtn.addEventListener('click', e => {
      e.preventDefault();
      showLoginForm();
    });
  }

  if (showLoginFromResetBtn) {
    showLoginFromResetBtn.addEventListener('click', e => {
      e.preventDefault();
      passwordRecovery = false;
      showLoginForm();
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to logout?')) {
        try {
          const { error } = await getSupabaseClient().auth.signOut();
          if (error) throw error;
          currentUser = null;
          combinedRecords = [];
          showLoginPage();
          document.getElementById('loginFormElement').reset();
          document.getElementById('registerFormElement').reset();
        } catch (error) {
          alert(error.message);
        }
      }
    });
  }
}

function showLoginForm() {
  passwordRecovery = false;
  showPasswordResetRequest();
  document.getElementById('loginForm').classList.remove('hidden');
  document.getElementById('registerForm').classList.add('hidden');
  document.getElementById('resetPasswordForm').classList.add('hidden');
}

function showPasswordRecoveryForm() {
  passwordRecovery = true;
  currentUser = null;
  showLoginPage();
  document.getElementById('loginForm').classList.add('hidden');
  document.getElementById('registerForm').classList.add('hidden');
  document.getElementById('resetPasswordForm').classList.remove('hidden');
  document.getElementById('resetRequestFields').classList.add('hidden');
  document.getElementById('resetUpdateFields').classList.remove('hidden');
  document.getElementById('resetEmail').required = false;
  document.getElementById('resetNewPassword').required = true;
  document.getElementById('resetConfirmPassword').required = true;
  document.getElementById('resetSubmitBtn').textContent = 'Update Password';
}

function showPasswordResetRequest() {
  passwordRecovery = false;
  document.getElementById('resetRequestFields').classList.remove('hidden');
  document.getElementById('resetUpdateFields').classList.add('hidden');
  document.getElementById('resetEmail').required = true;
  document.getElementById('resetNewPassword').required = false;
  document.getElementById('resetConfirmPassword').required = false;
  document.getElementById('resetSubmitBtn').textContent = 'Send Reset Email';
}

// ===== DATA MANAGEMENT =====

function readData(key) {
  return key === COMBINED_KEY ? combinedRecords : [];
}

function recordFromDatabase(row) {
  return {
    id: row.id,
    date: row.date,
    clientEquipment: row.client_equipment,
    activity: row.activity,
    workStatus: row.work_status,
    issueFixed: row.issue_fixed || '',
    spareName: row.spare_name || '',
    spareSource: row.spare_source || '',
    spareCost: Number(row.spare_cost || 0),
    receiptNumber: row.receipt_number || '',
    serviceItem: row.service_item || '',
    amountPaid: Number(row.amount_paid || 0),
    paymentMethod: row.payment_method || '',
    paymentNotes: row.payment_notes || '',
  };
}

function recordToDatabase(record) {
  return {
    date: record.date,
    client_equipment: record.clientEquipment,
    activity: record.activity,
    work_status: record.workStatus,
    issue_fixed: record.issueFixed || '',
    spare_name: record.spareName || '',
    spare_source: record.spareSource || '',
    spare_cost: Number(record.spareCost || 0),
    receipt_number: record.receiptNumber || '',
    service_item: record.serviceItem || '',
    amount_paid: Number(record.amountPaid || 0),
    payment_method: record.paymentMethod || '',
    payment_notes: record.paymentNotes || '',
  };
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
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
  const monthOptions = ['<option value="all">All records</option>'];
  orderedMonths.forEach(monthKey => {
    const [year, month] = monthKey.split('-');
    const label = new Date(Number(year), Number(month) - 1, 1).toLocaleString('en-US', {
      month: 'long',
      year: 'numeric',
    });
    monthOptions.push(`<option value="${monthKey}">${label}</option>`);
  });

  const allFilters = [document.getElementById('monthFilter'), document.getElementById('summaryMonthFilter')];
  allFilters.forEach(filter => {
    if (!filter) return;
    filter.innerHTML = monthOptions.join('');
    if (!Array.from(filter.options).some(option => option.value === filter.value)) {
      filter.value = 'all';
    }
  });
}

function getSummaryRecords() {
  const records = readData(COMBINED_KEY);
  const summaryType = document.getElementById('summaryType')?.value || 'daily';
  const dailySummaryDate = document.getElementById('dailySummaryDate')?.value;
  const monthValue = document.getElementById('summaryMonthFilter')?.value || 'all';

  if (summaryType === 'daily' && dailySummaryDate) {
    return {
      title: `Daily Review - ${dailySummaryDate}`,
      records: records.filter(record => (record.date || '') === dailySummaryDate),
      mode: 'daily',
    };
  }

  const monthlyRecords = filterRecordsByMonth(records, monthValue);
  const chosenMonth = monthValue === 'all' ? 'All months' : monthValue;
  return {
    title: `Monthly Review - ${chosenMonth}`,
    records: monthlyRecords,
    mode: 'monthly',
  };
}

function renderSummaryReview() {
  const summaryType = document.getElementById('summaryType')?.value || 'daily';
  const { title, records, mode } = getSummaryRecords();
  const summaryRecordCount = document.getElementById('summaryRecordCount');
  const summaryIncome = document.getElementById('summaryIncome');
  const summaryExpenditure = document.getElementById('summaryExpenditure');
  const summaryProfit = document.getElementById('summaryProfit');
  const summaryList = document.getElementById('summaryList');
  const summaryListTitle = document.getElementById('summaryListTitle');
  const dailySummaryField = document.getElementById('dailySummaryField');
  const monthlySummaryField = document.getElementById('monthlySummaryField');

  if (dailySummaryField && monthlySummaryField) {
    if (summaryType === 'daily') {
      dailySummaryField.classList.remove('hidden');
      monthlySummaryField.classList.add('hidden');
    } else {
      dailySummaryField.classList.add('hidden');
      monthlySummaryField.classList.remove('hidden');
    }
  }

  const totalIncome = records.reduce((sum, r) => sum + (r.amountPaid || 0), 0);
  const totalExpenditure = records.reduce((sum, r) => sum + (r.spareCost || 0), 0);
  const totalProfit = totalIncome - totalExpenditure;

  if (summaryRecordCount) summaryRecordCount.textContent = records.length;
  if (summaryIncome) summaryIncome.textContent = formatCurrency(totalIncome);
  if (summaryExpenditure) summaryExpenditure.textContent = formatCurrency(totalExpenditure);
  if (summaryProfit) summaryProfit.textContent = formatCurrency(totalProfit);
  if (summaryListTitle) summaryListTitle.textContent = title;

  if (!summaryList) return;

  if (!records.length) {
    summaryList.innerHTML = '<li>No records found for this view.</li>';
    return;
  }

  summaryList.innerHTML = records
    .slice(0, 12)
    .map(record => {
      const amount = record.amountPaid ? formatCurrency(record.amountPaid) : 'No payment';
      const spare = record.spareName ? `${record.spareName} / ${formatCurrency(record.spareCost || 0)}` : 'No spare';
      return `<li><span>${escapeHTML(record.date)} • ${escapeHTML(record.clientEquipment)}</span><span>${amount} • ${escapeHTML(spare)}</span></li>`;
    })
    .join('');

  if (records.length > 12) {
    summaryList.innerHTML += '<li>Showing the latest 12 records.</li>';
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
              <td>${escapeHTML(record.date)}</td>
              <td>${escapeHTML(record.clientEquipment)}</td>
              <td>${escapeHTML(record.activity)}</td>
              <td>${escapeHTML(record.workStatus)}</td>
              <td>${record.spareName ? escapeHTML(record.spareName) + ' - ' + formatCurrency(record.spareCost) : '-'}</td>
              <td>${record.receiptNumber ? formatCurrency(record.amountPaid) + ' (' + escapeHTML(record.paymentMethod) + ')' : '-'}</td>
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
        <h4>Baltex Electronics</h4>
        <strong>Official Receipt</strong>
      </div>
      <div class="receipt-meta">
        <span>Receipt No:</span>
        <strong>${escapeHTML(record.receiptNumber || 'N/A')}</strong>
        <span>Date:</span>
        <strong>${escapeHTML(date)}</strong>
        <span>Generated:</span>
        <strong>${generatedAt}</strong>
      </div>
      <div class="receipt-meta">
        <span>Client:</span>
        <strong>${escapeHTML(record.clientEquipment)}</strong>
        <span>Service:</span>
        <strong>${escapeHTML(record.serviceItem || record.activity)}</strong>
        <span>Payment Method:</span>
        <strong>${escapeHTML(record.paymentMethod || 'N/A')}</strong>
      </div>
      <div class="receipt-row">
        <span>Amount Paid</span>
        <span class="amount">${formatCurrency(record.amountPaid || 0)}</span>
      </div>
      <div class="receipt-row">
        <span>Notes</span>
        <span>${escapeHTML(record.paymentNotes || 'N/A')}</span>
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
      <input type="date" id="editDate" value="${escapeHTML(record.date)}" required />
    </label>
    <label>
      <span>Client / Equipment</span>
      <input type="text" id="editClientEquipment" value="${escapeHTML(record.clientEquipment)}" required />
    </label>
    <label class="full-width">
      <span>Activity / Work Done</span>
      <textarea id="editActivity" rows="2" required>${escapeHTML(record.activity)}</textarea>
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
      <input type="text" id="editIssueFixed" value="${escapeHTML(record.issueFixed || '')}" />
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
      <input type="text" id="editSpareSource" value="${escapeHTML(record.spareSource || '')}" />
    </label>
    <label>
      <span>Cost (KES)</span>
      <input type="number" id="editSpareCost" min="0" step="0.01" value="${record.spareCost || 0}" />
    </label>
    <hr class="form-divider" />
    <h3>Payment (Optional)</h3>
    <label>
      <span>Receipt Number</span>
      <input type="text" id="editReceiptNumber" value="${escapeHTML(record.receiptNumber || '')}" />
    </label>
    <label>
      <span>Service / Item</span>
      <input type="text" id="editServiceItem" value="${escapeHTML(record.serviceItem || '')}" />
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
      <textarea id="editPaymentNotes" rows="2">${escapeHTML(record.paymentNotes || '')}</textarea>
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

async function saveEditedRecord() {
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

  try {
    const { data, error } = await getSupabaseClient()
      .from('records')
      .update(recordToDatabase(updatedRecord))
      .eq('id', editingRecordId)
      .select()
      .single();
    if (error) throw error;
    records[index] = recordFromDatabase(data);
    closeModal();
    renderRecords();
    updateDashboard();
    renderSummaryReview();
    alert('Record updated successfully');
  } catch (error) {
    alert(error.message);
  }
}

async function deleteRecord(recordId) {
  if (!confirm('Are you sure you want to delete this record? This action cannot be undone.')) {
    return;
  }
  try {
    const { error } = await getSupabaseClient()
      .from('records')
      .delete()
      .eq('id', recordId);
    if (error) throw error;
    combinedRecords = combinedRecords.filter(record => record.id !== recordId);
    renderRecords();
    updateDashboard();
    renderSummaryReview();
    populateMonthFilterOptions();
  } catch (error) {
    alert(error.message);
  }
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
    `baltex-records-${new Date().toISOString().split('T')[0]}.csv`
  );
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

async function handleCombinedSubmit(event) {
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

  try {
    const { data, error } = await getSupabaseClient()
      .from('records')
      .insert(recordToDatabase(record))
      .select()
      .single();
    if (error) throw error;
    const savedRecord = recordFromDatabase(data);
    combinedRecords.unshift(savedRecord);
    renderRecords();
    updateDashboard();
    renderSummaryReview();
    populateMonthFilterOptions();

    if (savedRecord.amountPaid > 0) {
      renderPreviewFromRecord(savedRecord);
    }

    combinedForm.reset();
    document.getElementById('recordDate').valueAsDate = new Date();
  } catch (error) {
    alert(error.message);
  }
}

function productFromDatabase(row) {
  return {
    id: row.id,
    sku: row.sku,
    barcode: row.barcode || '',
    name: row.name,
    brand: row.brand || '',
    model: row.model || '',
    description: row.description || '',
    category: row.category,
    costPrice: Number(row.cost_price || 0),
    sellingPrice: Number(row.selling_price || 0),
    stockQuantity: Number(row.stock_quantity || 0),
    lowStockThreshold: Number(row.low_stock_threshold || 0),
  };
}

async function loadInventoryData() {
  const client = getSupabaseClient();
  const [productsResult, movementsResult] = await Promise.all([
    client.from('inventory_products').select('*').order('name'),
    client
      .from('inventory_transactions')
      .select('id, movement_type, quantity_delta, note, created_at, product:inventory_products(name, sku)')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);
  if (productsResult.error) throw productsResult.error;
  if (movementsResult.error) throw movementsResult.error;

  inventoryProducts = productsResult.data.map(productFromDatabase);
  inventoryTransactions = movementsResult.data;
  renderInventory();
}

function findProductByCode(code) {
  const normalizedCode = code.trim().toLowerCase();
  return inventoryProducts.find(product =>
    product.sku.trim().toLowerCase() === normalizedCode ||
    (product.barcode && product.barcode.trim() === code.trim())
  );
}

async function stopBarcodeScanner(closeModal = false) {
  scannerSessionId += 1;
  const scanner = html5QrCode;
  html5QrCode = null;
  if (scanner) {
    if (scanner.isScanning) await scanner.stop();
    scanner.clear();
  }
  if (closeModal) {
    getElement('scannerModal').classList.remove('show');
    getElement('scannerModal').setAttribute('aria-hidden', 'true');
    scannerTarget = null;
  }
}

function closeBarcodeScanner() {
  stopBarcodeScanner(true).catch(error => {
    getElement('scannerStatus').textContent = `Unable to stop camera: ${error.message}`;
  });
}

async function openBarcodeScanner(target) {
  try {
    await stopBarcodeScanner();
  } catch (error) {
    getElement('scannerStatus').textContent = `Unable to stop the previous camera: ${error.message}`;
    return;
  }

  scannerTarget = target;
  const modal = getElement('scannerModal');
  const status = getElement('scannerStatus');
  getElement(target === 'stock' ? 'movementScanMessage' : 'productScanMessage').textContent = '';
  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
  status.textContent = 'Starting camera...';
  const sessionId = scannerSessionId;

  if (!window.Html5Qrcode || !window.Html5QrcodeSupportedFormats) {
    status.textContent = 'The scanner library did not load. Check your internet connection and reload the page.';
    return;
  }

  const supportedFormats = window.Html5QrcodeSupportedFormats;
  const formats = [
    supportedFormats.QR_CODE,
    supportedFormats.EAN_13,
    supportedFormats.EAN_8,
    supportedFormats.UPC_A,
    supportedFormats.UPC_E,
    supportedFormats.CODE_128,
    supportedFormats.CODE_39,
    supportedFormats.CODE_93,
    supportedFormats.ITF,
    supportedFormats.DATA_MATRIX,
    supportedFormats.AZTEC,
    supportedFormats.PDF_417,
    supportedFormats.CODABAR,
  ].filter(format => Number.isInteger(format));
  if (!formats.length) {
    status.textContent = 'This browser has no supported barcode formats. Enter the code manually.';
    return;
  }

  const scanner = new window.Html5Qrcode('scannerReader', { formatsToSupport: formats });
  html5QrCode = scanner;
  const scanConfig = { fps: 10 };
  const onScanSuccess = decodedText => {
    if (sessionId !== scannerSessionId) return;
    const targetToApply = scannerTarget;
    closeBarcodeScanner();
    applyScannedProductCode(decodedText, targetToApply).catch(error => {
      const messageId = targetToApply === 'stock' ? 'movementScanMessage' : 'productScanMessage';
      getElement(messageId).textContent = `Unable to process scan: ${error.message}`;
    });
  };
  const onScanFailure = () => {};
  try {
    try {
      await scanner.start(
        { facingMode: 'environment' },
        scanConfig,
        onScanSuccess,
        onScanFailure
      );
    } catch (cameraError) {
      if (sessionId !== scannerSessionId) return;
      const cameras = await window.Html5Qrcode.getCameras();
      if (sessionId !== scannerSessionId) return;
      if (!cameras.length) throw cameraError;
      await scanner.start(cameras[0].id, scanConfig, onScanSuccess, onScanFailure);
    }
    if (sessionId !== scannerSessionId) {
      if (scanner.isScanning) await scanner.stop();
      scanner.clear();
      return;
    }
    status.textContent = 'Point the camera at a barcode or QR code.';
  } catch (error) {
    if (sessionId !== scannerSessionId) return;
    status.textContent = `Unable to access the camera or start scanning: ${error.message}`;
    try {
      await stopBarcodeScanner();
    } catch (stopError) {
      status.textContent += ` Camera cleanup failed: ${stopError.message}`;
    }
  }
}

function setScanMessage(elementId, text, linkUrl = null) {
  const message = getElement(elementId);
  message.textContent = text;
  if (!linkUrl) return;

  const link = document.createElement('a');
  link.href = linkUrl.href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = `Open ${linkUrl.hostname}`;
  message.append(' ', link);
}

function getHttpsQrUrl(code) {
  try {
    const url = new URL(code);
    return url.protocol === 'https:' && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

function isQrUrl(code) {
  return /^https?:\/\//i.test(code);
}

function isProductLookupBarcode(code) {
  return /^(?:\d{8}|\d{12,14})$/.test(code);
}

function guessProductCategory(category, name) {
  const details = `${category} ${name}`.toLowerCase();
  if (/\b(laptop|notebook|macbook|chromebook|desktop|computer)\b/.test(details)) return 'Laptops';
  if (/\b(phone|smartphone|cell phone|iphone|android|mobile)\b/.test(details)) return 'Phones';
  if (/\b(accessor|charger|cable|case|headphone|earbud)\b/.test(details)) return 'Accessories';
  if (/\b(parts|component|replacement)\b/.test(details)) return 'Parts';
  return 'Other electronics';
}

async function lookupProductByBarcode(barcode) {
  const { data, error } = await getSupabaseClient()
    .functions
    .invoke('product-lookup', { body: { barcode } });
  if (error) {
    let message = error.message;
    if (error.context && typeof error.context.json === 'function') {
      const responseBody = await error.context.json().catch(() => null);
      if (responseBody && responseBody.error) message = responseBody.error;
    }
    throw new Error(message);
  }
  if (data && data.error) throw new Error(data.error);
  return data ? data.product : null;
}

function fillProductFormFromLookup(code, product) {
  getElement('productBarcode').value = code;
  if (!getElement('productSku').value.trim()) getElement('productSku').value = code;
  if (!getElement('productName').value.trim()) {
    getElement('productName').value = String(product.name || '').slice(0, 120);
  }
  if (!getElement('productBrand').value.trim()) {
    getElement('productBrand').value = String(product.brand || '').slice(0, 80);
  }
  if (!getElement('productModel').value.trim()) {
    getElement('productModel').value = String(product.model || '').slice(0, 80);
  }
  if (!getElement('productDescription').value.trim()) {
    getElement('productDescription').value = String(product.description || '').slice(0, 1000);
  }
  if (!getElement('productCategory').value) {
    getElement('productCategory').value = guessProductCategory(product.category, product.name);
  }
}

async function applyScannedProductCode(rawCode, target) {
  const code = String(rawCode || '').trim();
  if (!code) return;

  const product = findProductByCode(code);
  if (target === 'stock') {
    if (!product) {
      const qrUrl = getHttpsQrUrl(code);
      if (qrUrl) {
        setScanMessage('movementScanMessage', `No catalogue match. Check the QR domain (${qrUrl.hostname}) before opening it.`, qrUrl);
      } else if (isQrUrl(code)) {
        setScanMessage('movementScanMessage', 'This QR URL is not safe to open here. Visit the manufacturer website directly and verify the address.');
      } else {
        setScanMessage('movementScanMessage', 'No matching product found. Add it in Product Catalogue first; UPC/EAN scans there can look up product details.');
      }
      return;
    }
    getElement('movementProduct').value = product.id;
    setScanMessage('movementScanMessage', `Selected ${product.name} (${product.sku}).`);
    return;
  }

  if (product) {
    editInventoryProduct(product.id);
    getElement('productBarcode').value = product.barcode || code;
    setScanMessage('productScanMessage', `Found ${product.name}. Review the details and save to keep any barcode changes.`);
    return;
  }

  if (editingProductId) {
    setScanMessage('productScanMessage', 'This code is not in the catalogue. Cancel the current edit before adding a new product.');
    return;
  }

  if (code.length > 500) {
    const qrUrl = getHttpsQrUrl(code);
    setScanMessage(
      'productScanMessage',
      'This scanned value is too long to save as a barcode. Verify the QR destination before opening it.',
      qrUrl
    );
    return;
  }

  getElement('productBarcode').value = code;
  getElement('productName').focus();

  const qrUrl = getHttpsQrUrl(code);
  if (qrUrl) {
    setScanMessage('productScanMessage', `QR link scanned (${qrUrl.hostname}). Check the domain before opening it.`, qrUrl);
    return;
  }
  if (isQrUrl(code)) {
    setScanMessage('productScanMessage', 'This QR URL is not safe to open here. Visit the manufacturer website directly and verify the address.');
    return;
  }

  if (!isProductLookupBarcode(code)) {
    setScanMessage('productScanMessage', 'This code is not a UPC/EAN product barcode, so it was not sent to the product lookup service. Enter product details manually and verify serial/authentication codes with the manufacturer.');
    return;
  }

  try {
    const productDetails = await lookupProductByBarcode(code);
    if (!productDetails) {
      if (!getElement('productSku').value.trim()) getElement('productSku').value = code;
      setScanMessage('productScanMessage', 'No product details were found for this UPC/EAN. The code is saved in the form; enter the product details manually.');
      return;
    }
    fillProductFormFromLookup(code, productDetails);
    setScanMessage('productScanMessage', `Found ${productDetails.name || 'product details'} in the UPCitemdb catalogue. Verify the details; prices and stock remain manual.`);
  } catch (error) {
    setScanMessage('productScanMessage', `Product lookup failed: ${error.message}. The scanned code is in the form; enter details manually.`);
  }
}

function renderInventory() {
  const productBody = getElement('inventoryProductsBody');
  const movementBody = getElement('stockMovementsBody');
  const movementProduct = getElement('movementProduct');
  const selectedProductId = movementProduct.value;
  const lowStockProducts = inventoryProducts.filter(
    product => product.stockQuantity <= product.lowStockThreshold
  );

  getElement('inventoryProductCount').textContent = inventoryProducts.length;
  getElement('inventoryUnitCount').textContent = inventoryProducts.reduce(
    (total, product) => total + product.stockQuantity,
    0
  );
  getElement('lowStockCount').textContent = lowStockProducts.length;
  getElement('lowStockMessage').textContent = lowStockProducts.length
    ? `Low stock: ${lowStockProducts.map(product => `${product.name} (${product.stockQuantity})`).join(', ')}`
    : 'All products are above their low-stock alert levels.';

  productBody.innerHTML = inventoryProducts.length
    ? inventoryProducts.map(product => `
        <tr class="${product.stockQuantity <= product.lowStockThreshold ? 'low-stock-row' : ''}">
          <td><strong>${escapeHTML(product.name)}</strong><br><small>${escapeHTML([product.brand, product.model, product.sku].filter(Boolean).join(' · '))}${product.barcode ? ` · ${escapeHTML(product.barcode)}` : ''}</small></td>
          <td>${escapeHTML(product.category)}</td>
          <td>${product.stockQuantity} ${product.stockQuantity <= product.lowStockThreshold ? '<strong>(Low)</strong>' : ''}</td>
          <td>${formatCurrency(product.costPrice)}</td>
          <td>${formatCurrency(product.sellingPrice)}</td>
          <td>
            <div class="action-buttons">
              <button type="button" class="btn-small btn-edit" data-product-action="edit" data-product-id="${escapeHTML(product.id)}">Edit</button>
              <button type="button" class="btn-small btn-delete" data-product-action="delete" data-product-id="${escapeHTML(product.id)}">Delete</button>
            </div>
          </td>
        </tr>
      `).join('')
    : '<tr><td colspan="6">No products in the catalogue yet.</td></tr>';

  movementProduct.innerHTML = '<option value="">Choose a product</option>' +
    inventoryProducts.map(product =>
      `<option value="${escapeHTML(product.id)}">${escapeHTML(product.name)} (${escapeHTML(product.sku)}) — ${product.stockQuantity} in stock</option>`
    ).join('');
  if (inventoryProducts.some(product => product.id === selectedProductId)) {
    movementProduct.value = selectedProductId;
  }

  movementBody.innerHTML = inventoryTransactions.length
    ? inventoryTransactions.map(transaction => {
        const operationNames = {
          received: 'Received',
          sale: 'Sale',
          adjustment: 'Adjustment',
        };
        const product = transaction.product;
        return `
          <tr>
            <td>${escapeHTML(new Date(transaction.created_at).toLocaleString())}</td>
            <td>${escapeHTML(product ? product.name : 'Product removed')}</td>
            <td>${operationNames[transaction.movement_type] || escapeHTML(transaction.movement_type)}</td>
            <td>${transaction.quantity_delta > 0 ? '+' : ''}${transaction.quantity_delta}</td>
            <td>${escapeHTML(transaction.note || '')}</td>
          </tr>
        `;
      }).join('')
    : '<tr><td colspan="5">No stock activity recorded yet.</td></tr>';
}

function resetProductForm() {
  editingProductId = null;
  getElement('productForm').reset();
  getElement('productScanMessage').textContent = '';
  getElement('productThreshold').value = '2';
  getElement('saveProductBtn').textContent = 'Add Product';
  getElement('cancelProductEditBtn').classList.add('hidden');
}

async function handleProductSubmit(event) {
  event.preventDefault();
  const product = {
    sku: getElement('productSku').value.trim().toUpperCase(),
    barcode: getElement('productBarcode').value.trim() || null,
    name: getElement('productName').value.trim(),
    brand: getElement('productBrand').value.trim(),
    model: getElement('productModel').value.trim(),
    description: getElement('productDescription').value.trim(),
    category: getElement('productCategory').value,
    cost_price: Number(getElement('productCost').value),
    selling_price: Number(getElement('productPrice').value),
    low_stock_threshold: Number(getElement('productThreshold').value),
  };

  try {
    const request = getSupabaseClient().from('inventory_products');
    const { error } = editingProductId
      ? await request.update(product).eq('id', editingProductId)
      : await request.insert(product);
    if (error) throw error;
    resetProductForm();
    await loadInventoryData();
  } catch (error) {
    alert(error.message);
  }
}

function editInventoryProduct(productId) {
  const product = inventoryProducts.find(item => item.id === productId);
  if (!product) return;
  editingProductId = product.id;
  getElement('productName').value = product.name;
  getElement('productSku').value = product.sku;
  getElement('productBarcode').value = product.barcode || '';
  getElement('productBrand').value = product.brand;
  getElement('productModel').value = product.model;
  getElement('productDescription').value = product.description;
  getElement('productCategory').value = product.category;
  getElement('productCost').value = product.costPrice;
  getElement('productPrice').value = product.sellingPrice;
  getElement('productThreshold').value = product.lowStockThreshold;
  getElement('saveProductBtn').textContent = 'Save Product Changes';
  getElement('cancelProductEditBtn').classList.remove('hidden');
  getElement('productName').focus();
}

async function deleteInventoryProduct(productId) {
  const product = inventoryProducts.find(item => item.id === productId);
  if (!product || !confirm(`Delete ${product.name}? Products with stock activity cannot be deleted.`)) return;
  try {
    const { error } = await getSupabaseClient()
      .from('inventory_products')
      .delete()
      .eq('id', productId);
    if (error) throw error;
    await loadInventoryData();
  } catch (error) {
    alert(error.message);
  }
}

async function handleStockMovement(event) {
  event.preventDefault();
  const operation = getElement('movementType').value;
  const quantity = Number(getElement('movementQuantity').value);
  const quantityDelta = operation === 'sale' || operation === 'adjust_decrease'
    ? -quantity
    : quantity;
  const movementType = operation === 'received' || operation === 'sale'
    ? operation
    : 'adjustment';
  const movement = {
    product_id: getElement('movementProduct').value,
    movement_type: movementType,
    quantity_delta: quantityDelta,
    note: getElement('movementNote').value.trim(),
  };

  try {
    const { error } = await getSupabaseClient()
      .from('inventory_transactions')
      .insert(movement);
    if (error) throw error;
    getElement('stockMovementForm').reset();
    getElement('movementScanMessage').textContent = '';
    await loadInventoryData();
  } catch (error) {
    alert(error.message);
  }
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
  const summaryType = getElement('summaryType');
  const dailySummaryDate = getElement('dailySummaryDate');
  const summaryMonthFilter = getElement('summaryMonthFilter');
  const exportRecordsBtn = getElement('exportRecordsBtn');
  const clearAllBtn = getElement('clearAllBtn');
  const productForm = getElement('productForm');
  const stockMovementForm = getElement('stockMovementForm');
  const productBody = getElement('inventoryProductsBody');
  const cancelProductEditBtn = getElement('cancelProductEditBtn');
  const scanProductBtn = getElement('scanProductBtn');
  const scanMovementBtn = getElement('scanMovementBtn');
  const scannerModal = getElement('scannerModal');
  const closeScannerBtn = getElement('closeScannerBtn');
  const cancelScannerBtn = getElement('cancelScannerBtn');

  document.querySelectorAll('.section-nav-button').forEach(button => {
    button.addEventListener('click', () => showAppSection(button.dataset.section));
  });
  if (productForm) productForm.addEventListener('submit', handleProductSubmit);
  if (stockMovementForm) stockMovementForm.addEventListener('submit', handleStockMovement);
  if (scanProductBtn) scanProductBtn.addEventListener('click', () => openBarcodeScanner('catalogue'));
  if (scanMovementBtn) scanMovementBtn.addEventListener('click', () => openBarcodeScanner('stock'));
  if (closeScannerBtn) closeScannerBtn.addEventListener('click', closeBarcodeScanner);
  if (cancelScannerBtn) cancelScannerBtn.addEventListener('click', closeBarcodeScanner);
  if (scannerModal) {
    scannerModal.addEventListener('click', event => {
      if (event.target === scannerModal) closeBarcodeScanner();
    });
  }
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && scannerModal.classList.contains('show')) {
      closeBarcodeScanner();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && html5QrCode) closeBarcodeScanner();
  });
  if (cancelProductEditBtn) cancelProductEditBtn.addEventListener('click', resetProductForm);
  if (productBody) {
    productBody.addEventListener('click', event => {
      const button = event.target.closest('[data-product-action]');
      if (!button) return;
      if (button.dataset.productAction === 'edit') {
        editInventoryProduct(button.dataset.productId);
      } else if (button.dataset.productAction === 'delete') {
        deleteInventoryProduct(button.dataset.productId);
      }
    });
  }
  if (recordFilter) recordFilter.addEventListener('input', e => renderRecords(e.target.value));
  if (monthFilter) monthFilter.addEventListener('change', () => {
    renderRecords(recordFilter ? recordFilter.value : '');
    updateDashboard();
    renderSummaryReview();
  });
  if (summaryType) summaryType.addEventListener('change', renderSummaryReview);
  if (dailySummaryDate) dailySummaryDate.addEventListener('change', renderSummaryReview);
  if (summaryMonthFilter) summaryMonthFilter.addEventListener('change', renderSummaryReview);
  if (exportRecordsBtn) exportRecordsBtn.addEventListener('click', exportToCSV);

  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', async () => {
      if (confirm('⚠️ This will DELETE ALL DATA! This action cannot be undone. Type "DELETE ALL" to confirm.')) {
        const userInput = prompt('Type "DELETE ALL" to confirm:');
        if (userInput === 'DELETE ALL') {
          try {
            const { error } = await getSupabaseClient()
              .from('records')
              .delete()
              .not('id', 'is', null);
            if (error) throw error;
            combinedRecords = [];
            renderRecords();
            updateDashboard();
            renderSummaryReview();
            populateMonthFilterOptions();
            alert('All data has been deleted');
          } catch (error) {
            alert(error.message);
          }
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
setupAuthEvents();
setupFormEvents();
populateMonthFilterOptions();

const today = new Date().toISOString().slice(0, 10);
const dailySummaryDate = getElement('dailySummaryDate');
if (dailySummaryDate) dailySummaryDate.value = today;

const summaryType = getElement('summaryType');
if (summaryType) summaryType.value = 'daily';

if (supabaseClient) {
  supabaseClient.auth.onAuthStateChange(event => {
    if (event === 'PASSWORD_RECOVERY') {
      showPasswordRecoveryForm();
    }
  });
}

checkAuth();
