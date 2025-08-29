const API_URL = 'http://127.0.0.1:5000';
let allCustomers = [], allItems = [], currentReportData = null;
let sortColumn = 'name', sortDirection = 'asc';

// Tab切換函數 - 手動實現不依賴Bootstrap
function switchTab(event, tabId) {
    event.preventDefault();
    
    // 找到父容器
    const container = event.target.closest('.card');
    if (!container) return;
    
    // 移除所有active類
    container.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    
    // 隱藏所有tab內容
    container.querySelectorAll('.tab-pane').forEach(pane => {
        pane.style.display = 'none';
        pane.classList.remove('show', 'active');
    });
    
    // 激活當前tab按鈕
    event.target.classList.add('active');
    
    // 顯示對應的tab內容
    const targetPane = document.getElementById(tabId);
    if (targetPane) {
        targetPane.style.display = 'block';
        targetPane.classList.add('show', 'active');
    }
}

function showView(viewId) {
    document.querySelectorAll('.view').forEach(view => view.style.display = 'none');
    document.getElementById(viewId).style.display = 'block';
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    
    const activeLink = document.querySelector(`[onclick="showView('${viewId}')"]`);
    if (activeLink) {
        activeLink.classList.add('active');
    }

    if (viewId === 'dashboard-view') {
        updateReconciliationStatus();
    }
    if (viewId === 'summaries-view') {
        fetchAndRenderSummaries();
    }
    if (viewId === 'all-bills-view') {
        fetchAllBills();
        populateBillFilters();
    }
}

window.onload = () => {
    console.log('頁面載入開始初始化...');
    
    populateDateSelectors();
    fetchAndRenderCustomers();
    fetchAndRenderItems();
    
    const todayElement = document.getElementById('today-date');
    if (todayElement) {
        todayElement.textContent = new Date().toLocaleDateString('zh-TW', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
    }
    
    showView('dashboard-view');
    
    const yearSelectEl = document.getElementById('yearSelect');
    const monthSelectEl = document.getElementById('monthSelect');
    
    if (yearSelectEl) {
        yearSelectEl.addEventListener('change', updateReconciliationStatus);
    }
    if (monthSelectEl) {
        monthSelectEl.addEventListener('change', updateReconciliationStatus);
    }
    
    console.log('頁面初始化完成');
};

function populateDateSelectors() {
    const yearSelect = document.getElementById('yearSelect');
    const monthSelect = document.getElementById('monthSelect');
    
    if (!yearSelect || !monthSelect) {
        console.error('找不到日期選擇器元素');
        return;
    }
    
    yearSelect.innerHTML = '';
    monthSelect.innerHTML = '';
    
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;
    
    for (let i = currentYear + 5; i >= currentYear - 5; i--) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `${i} 年`;
        yearSelect.appendChild(option);
    }
    
    for (let i = 1; i <= 12; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `${i} 月`;
        monthSelect.appendChild(option);
    }
    
    yearSelect.value = currentYear;
    monthSelect.value = currentMonth;
    
    console.log('日期選擇器已初始化 - 年份:', currentYear, '月份:', currentMonth);
}

async function fetchAndRenderCustomers() {
    const response = await fetch(`${API_URL}/customers`);
    if (!response.ok) { console.error('無法載入客戶列表'); return; }
    allCustomers = await response.json();
    const activeCustomers = allCustomers.filter(c => c.is_active);
    const deactivatedCustomers = allCustomers.filter(c => !c.is_active);
    const activeList = document.getElementById('activeCustomerList');
    const deactivatedList = document.getElementById('deactivatedCustomerList');
    const reconCustomerSelect = document.getElementById('reconCustomerSelect');
    activeList.innerHTML = '';
    deactivatedList.innerHTML = '';
    reconCustomerSelect.innerHTML = '<option value="">-- 請選擇客戶 --</option>';
    document.getElementById('activeCustomerCount').textContent = activeCustomers.length;
    activeCustomers.forEach(customer => {
        const listItem = document.createElement('li');
        listItem.className = 'list-group-item';
        const itemDiv = document.createElement('div');
        itemDiv.className = 'customer-item';
        itemDiv.innerHTML = `<span>${customer.name}</span><div class="actions"><button class="btn btn-sm btn-warning" onclick="deactivateCustomer(${customer.id}, '${customer.name}')">停用</button><button class="btn btn-sm btn-danger" onclick="deleteCustomer(${customer.id}, '${customer.name}')">刪除</button></div>`;
        listItem.appendChild(itemDiv);
        activeList.appendChild(listItem);
        const option = document.createElement('option');
        option.value = customer.id;
        option.textContent = customer.name;
        reconCustomerSelect.appendChild(option);
    });
    deactivatedCustomers.forEach(customer => {
        const listItem = document.createElement('li');
        listItem.className = 'list-group-item';
        const itemDiv = document.createElement('div');
        itemDiv.className = 'customer-item deactivated';
        itemDiv.innerHTML = `<span>${customer.name}</span><div class="actions"><button class="btn btn-sm btn-success" onclick="reactivateCustomer(${customer.id}, '${customer.name}')">啟用</button><button class="btn btn-sm btn-danger" onclick="deleteCustomer(${customer.id}, '${customer.name}')">刪除</button></div>`;
        deactivatedList.appendChild(listItem);
    });
}

async function fetchAndRenderItems() {
    const response = await fetch(`${API_URL}/items`);
    allItems = await response.json();
    sortTable('name', true);
}

function sortTable(column, isInitialLoad = false) {
    if (!isInitialLoad) {
        if (sortColumn === column) { sortDirection = sortDirection === 'asc' ? 'desc' : 'asc'; }
        else { sortColumn = column; sortDirection = 'asc'; }
    }
    allItems.sort((a, b) => {
        const valA = a[sortColumn] || ''; const valB = b[sortColumn] || '';
        const comparator = valA.localeCompare(valB, 'zh-Hant');
        return sortDirection === 'asc' ? comparator : -comparator;
    });
    renderItemsTable();
    updateSortArrows();
}

function renderItemsTable() {
    const tableBody = document.getElementById('itemTableBody');
    tableBody.innerHTML = '';
    allItems.forEach(item => {
        const row = tableBody.insertRow();
        row.innerHTML = `<td>${item.name}</td><td>${item.category}</td><td class="actions"><button class="btn btn-sm btn-info" onclick="editItem(${item.id}, '${item.name}', '${item.category}')">修改</button><button class="btn btn-sm btn-danger" onclick="deleteItem(${item.id})">刪除</button></td>`;
    });
}

function updateSortArrows() {
    document.getElementById('sort-arrow-name').textContent = '';
    document.getElementById('sort-arrow-category').textContent = '';
    const arrow = sortDirection === 'asc' ? ' ▲' : ' ▼';
    document.getElementById(`sort-arrow-${sortColumn}`).textContent = arrow;
}

async function addCustomer() {
    const nameInput = document.getElementById('customerNameInput');
    const name = nameInput.value.trim();
    if (!name) { alert('客戶名稱不能為空！'); return; }
    await fetch(`${API_URL}/customers`, { method: 'POST', body: JSON.stringify({ name }), headers: { 'Content-Type': 'application/json' } });
    nameInput.value = '';
    await fetchAndRenderCustomers();
}

async function deleteCustomer(id, name) {
    const password = prompt(`即將永久刪除客戶【${name}】！此操作無法復原，請輸入刪除密碼：`);
    if (password === null) return;
    if (!password) { alert("密碼不能為空！"); return; }
    const response = await fetch(`${API_URL}/customers/${id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: password }) });
    if (response.ok) { alert(`客戶【${name}】已成功刪除。`); await fetchAndRenderCustomers(); }
    else { const result = await response.json(); alert(`刪除失敗：${result.error}`); }
}

async function deactivateCustomer(id, name) {
    if (confirm(`確定要停用客戶【${name}】嗎？`)) {
        await fetch(`${API_URL}/customers/${id}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: false }) });
        await fetchAndRenderCustomers();
    }
}

async function reactivateCustomer(id, name) {
    if (confirm(`確定要重新啟用客戶【${name}】嗎？`)) {
        await fetch(`${API_URL}/customers/${id}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: true }) });
        await fetchAndRenderCustomers();
    }
}

async function addItem() {
    const nameInput = document.getElementById('itemNameInput');
    const categoryInput = document.getElementById('itemCategoryInput');
    const name = nameInput.value.trim();
    const category = categoryInput.value;
    if (!name) { alert('項目名稱不能為空！'); return; }
    const existing = allItems.some(i => i.name === name);
    if(existing) { alert('此項目名稱已存在！'); return; }
    await fetch(`${API_URL}/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, category }) });
    nameInput.value = '';
    fetchAndRenderItems();
}

async function editItem(id, currentName, currentCategory) {
    const newName = prompt('請輸入新的項目名稱：', currentName);
    if (newName === null) return;
    const newCategory = prompt('請輸入新的歸屬 (總公司/分公司)：', currentCategory);
    if (newCategory === null || !['總公司', '分公司'].includes(newCategory)) {
        alert('歸屬必須是 "總公司" 或 "分公司"');
        return;
    }
    if (newName.trim()) {
        await fetch(`${API_URL}/items/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName.trim(), category: newCategory }) });
        fetchAndRenderItems();
    }
}

async function deleteItem(id) {
    if (confirm('你確定要刪除這個項目嗎？')) {
        await fetch(`${API_URL}/items/${id}`, { method: 'DELETE' });
        fetchAndRenderItems();
    }
}

// 建立Tab明細HTML的輔助函數
function createTabDetailsHTML(items) {
    if (!items || items.length === 0) {
        return '<p class="text-muted p-3">此分類無資料</p>';
    }
    
    let html = `
        <table class="table table-sm table-striped">
            <thead>
                <tr>
                    <th>項目名稱</th>
                    <th>單價</th>
                    <th>數量</th>
                    <th class="text-end">總價</th>
                    <th>備註</th>
                </tr>
            </thead>
            <tbody>`;
    
    let subtotal = 0;
    items.forEach(item => {
        const price = item.total_price || 0;
        subtotal += price;
        html += `
            <tr>
                <td>${item.item_name}</td>
                <td>${item.unit_price}</td>
                <td>${item.quantity}</td>
                <td class="text-end">$${price.toFixed(2)}</td>
                <td>${item.remark || ''}</td>
            </tr>`;
    });
    
    html += `
            </tbody>
            <tfoot>
                <tr class="table-info">
                    <td colspan="3" class="text-end"><strong>小計：</strong></td>
                    <td class="text-end"><strong>$${subtotal.toFixed(2)}</strong></td>
                    <td></td>
                </tr>
            </tfoot>
        </table>`;
    
    return html;
}

// 分類明細項目的輔助函數
function categorizeDetailedItems(items) {
    const categories = {
        '款項明細': [],
        '其他應退數': [],
        '其他應收數': []
    };
    
    if (!items) return categories;
    
    // 調試：輸出所有項目的tab_source
    console.log('===== 開始分類項目 =====');
    console.log('總項目數：', items.length);
    
    items.forEach((item, index) => {
        // 調試輸出每個項目的關鍵信息
        if (index < 5) { // 只輸出前5個項目作為範例
            console.log(`項目${index + 1}:`, {
                name: item.item_name,
                tab_source: item.tab_source,
                price: item.total_price
            });
        }
        
        // 根據 tab_source 或 tab_breakdown 分類
        if (item.tab_source) {
            const source = item.tab_source.trim();
            
            // 完全匹配爬蟲返回的值
            if (source === '款項明細') {
                categories['款項明細'].push(item);
            } else if (source === '其他應退款' || source === '其他應該款' || source.includes('應退')) {
                categories['其他應退數'].push(item);
            } else if (source === '其他應收款' || source === '其他應收數' || source.includes('應收')) {
                categories['其他應收數'].push(item);
            } else {
                // 如果tab_source不匹配，則根據項目名稱判斷
                const itemName = item.item_name || '';
                if (itemName.includes('退') || itemName.includes('扣') || itemName.includes('減')) {
                    categories['其他應退數'].push(item);
                } else if (itemName.includes('其他費用') || itemName.includes('其他應收') || 
                          itemName.includes('補') || itemName.includes('加收')) {
                    categories['其他應收數'].push(item);
                } else {
                    categories['款項明細'].push(item);
                }
            }
        } else {
            // 沒有tab_source，根據項目名稱特徵分類
            const itemName = item.item_name || '';
            
            // 其他應退數
            if (itemName.includes('退') || itemName.includes('扣') || itemName.includes('減') || 
                itemName.includes('折讓') || itemName.includes('折扣')) {
                categories['其他應退數'].push(item);
            } 
            // 其他應收數 - 特別注意「其他費用」這類項目
            else if (itemName.includes('其他費用') || itemName.includes('其他應收') || 
                     itemName.includes('補') || itemName.includes('加收') || 
                     itemName.includes('額外') || itemName.includes('附加') ||
                     itemName.includes('其他專用')) {
                categories['其他應收數'].push(item);
            }
            // 預設為款項明細
            else {
                categories['款項明細'].push(item);
            }
        }
    });
    
    // 詳細調試輸出
    console.log('===== 分類結果 =====');
    console.log('款項明細：', categories['款項明細'].length, '筆');
    if (categories['款項明細'].length > 0) {
        console.log('款項明細範例：', categories['款項明細'].slice(0, 3).map(i => i.item_name));
    }
    console.log('其他應退數：', categories['其他應退數'].length, '筆');
    if (categories['其他應退數'].length > 0) {
        console.log('其他應退數範例：', categories['其他應退數'].slice(0, 3).map(i => i.item_name));
    }
    console.log('其他應收數：', categories['其他應收數'].length, '筆');
    if (categories['其他應收數'].length > 0) {
        console.log('其他應收數範例：', categories['其他應收數'].slice(0, 3).map(i => i.item_name));
    }
    
    return categories;
}

// 計算各Tab小計的輔助函數
function calculateTabSubtotals(categorizedItems) {
    const subtotals = {
        '款項明細': { before: 0, after: 0 },
        '其他應退數': { before: 0, after: 0 },
        '其他應收數': { before: 0, after: 0 }
    };
    
    Object.keys(categorizedItems).forEach(category => {
        let beforeTax = 0;
        let afterTax = 0;
        
        categorizedItems[category].forEach(item => {
            const price = item.total_price || 0;
            beforeTax += price;
            
            // 檢查是否為不計稅項目
            if (item.is_non_taxable || (item.item_name && item.item_name.includes('不計稅'))) {
                // 不計稅項目，稅後金額等於稅前
                afterTax += price;
            } else {
                // 需計稅項目，加5%營業稅
                afterTax += price * 1.05;
            }
        });
        
        subtotals[category].before = beforeTax;
        subtotals[category].after = afterTax;
    });
    
    return subtotals;
}

async function processReport() {
    const customerId = document.getElementById('reconCustomerSelect').value;
    if (!customerId) { alert('請先從列表選擇一位客戶！'); return; }
    const year = document.getElementById('yearSelect').value;
    const month = document.getElementById('monthSelect').value;
    const reportText = document.getElementById('reportInput').value;
    const resultDiv = document.getElementById('resultOutput');
    const saveBtn = document.getElementById('saveReportBtn');
    saveBtn.style.display = 'none';
    currentReportData = null;
    if (!reportText) { alert('請貼上報表文字！'); return; }
    resultDiv.innerHTML = '<p>正在計算中...</p>';
    const response = await fetch(`${API_URL}/process_report`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customer_id: customerId, year, month, text: reportText }) });
    const result = await response.json();
    const customerName = allCustomers.find(c => c.id == customerId).name;
    
    const totalRevenueTaxed = result.total_revenue_taxed || (result.total_revenue * 1.05);
    const headOfficeRevenueTaxed = result.head_office_revenue_taxed || (result.head_office_revenue * 1.05);
    const branchOfficeRevenueTaxed = result.branch_office_revenue_taxed || (result.branch_office_revenue * 1.05);
    
    const mainResultText = `對帳客戶：${customerName}
對帳月份：${year} 年 ${month} 月
--------------------------------
總營收：${result.total_revenue.toFixed(2)} （稅後：${totalRevenueTaxed.toFixed(2)}）

歸屬【總公司】：${result.head_office_revenue.toFixed(2)} （稅後：${headOfficeRevenueTaxed.toFixed(2)}）
歸屬【分公司】：${result.branch_office_revenue.toFixed(2)} （稅後：${branchOfficeRevenueTaxed.toFixed(2)}）`;
    
    // 分類項目
    const categorizedItems = categorizeDetailedItems(result.detailed_items);
    
    // 計算各Tab小計
    const tabSubtotals = calculateTabSubtotals(categorizedItems);
    
    // 新增Tab小計顯示
    const tabSummaryHTML = `
        <div class="card bg-light mt-3 mb-3">
            <div class="card-body">
                <h6 class="card-title mb-3">各類明細統計：</h6>
                <div class="row">
                    <div class="col-md-4">
                        <div class="text-primary">
                            <strong>款項明細：</strong><br>
                            ${tabSubtotals['款項明細'].before.toFixed(2)} （稅後：${tabSubtotals['款項明細'].after.toFixed(2)}）
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="text-warning">
                            <strong>其他應退數：</strong><br>
                            ${tabSubtotals['其他應退數'].before.toFixed(2)} （稅後：${tabSubtotals['其他應退數'].after.toFixed(2)}）
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="text-success">
                            <strong>其他應收數：</strong><br>
                            ${tabSubtotals['其他應收數'].before.toFixed(2)} （稅後：${tabSubtotals['其他應收數'].after.toFixed(2)}）
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    
    // 建立Tab介面 - 使用時間戳確保唯一ID
    const uniqueId = Date.now();
    const tabsHTML = `
        <div class="card mt-3">
            <div class="card-header">
                <ul class="nav nav-tabs card-header-tabs" role="tablist">
                    <li class="nav-item">
                        <button class="nav-link active" onclick="switchTab(event, 'detail-${uniqueId}')" type="button">
                            款項明細 
                            <span class="badge bg-primary">${categorizedItems['款項明細'].length}</span>
                        </button>
                    </li>
                    <li class="nav-item">
                        <button class="nav-link" onclick="switchTab(event, 'deduction-${uniqueId}')" type="button">
                            其他應退數 
                            <span class="badge bg-warning">${categorizedItems['其他應退數'].length}</span>
                        </button>
                    </li>
                    <li class="nav-item">
                        <button class="nav-link" onclick="switchTab(event, 'addition-${uniqueId}')" type="button">
                            其他應收數 
                            <span class="badge bg-success">${categorizedItems['其他應收數'].length}</span>
                        </button>
                    </li>
                </ul>
            </div>
            <div class="card-body">
                <div class="tab-content">
                    <div class="tab-pane show active" id="detail-${uniqueId}">
                        ${createTabDetailsHTML(categorizedItems['款項明細'])}
                    </div>
                    <div class="tab-pane" id="deduction-${uniqueId}" style="display:none;">
                        ${createTabDetailsHTML(categorizedItems['其他應退數'])}
                    </div>
                    <div class="tab-pane" id="addition-${uniqueId}" style="display:none;">
                        ${createTabDetailsHTML(categorizedItems['其他應收數'])}
                    </div>
                </div>
            </div>
        </div>`;
    
    let unclassifiedHtml = '';
    let nonTaxableHtml = '';
    
    if (result.detailed_items) {
        const nonTaxableItems = result.detailed_items.filter(item => item.is_non_taxable);
        if (nonTaxableItems.length > 0) {
            const itemsList = nonTaxableItems.map(item => `<li>${item.item_name} - ${item.total_price}</li>`).join('');
            nonTaxableHtml = `<div class="alert alert-info mt-3"><p><b>ℹ️ 以下項目不計稅：</b></p><ul>${itemsList}</ul></div>`;
        }
    }
    
    if (result.unclassified_items.length > 0) {
        const listItems = result.unclassified_items.map(item => `<li>${item}</li>`).join('');
        unclassifiedHtml = `<div class="alert alert-warning mt-3"><p><b>【注意】發現未分類項目：</b></p><ul>${listItems}</ul></div>`;
    } else {
        saveBtn.style.display = 'inline-block';
        currentReportData = {
            customer_id: parseInt(customerId), customer_name: customerName, year, month,
            total_revenue: result.total_revenue, head_office_revenue: result.head_office_revenue,
            branch_office_revenue: result.branch_office_revenue,
            total_revenue_taxed: totalRevenueTaxed,
            head_office_revenue_taxed: headOfficeRevenueTaxed,
            branch_office_revenue_taxed: branchOfficeRevenueTaxed,
            detailed_items: result.detailed_items
        };
    }
    
    resultDiv.innerHTML = `<pre>${mainResultText}</pre>${tabsHTML}${unclassifiedHtml}`;
}

async function saveReport() {
    if (!currentReportData) { alert('沒有可儲存的資料！'); return; }
    if (confirm(`確定入帳【${currentReportData.customer_name} - ${currentReportData.year}年${currentReportData.month}月】嗎？`)) {
        const response = await fetch(`${API_URL}/save_report`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(currentReportData) });
        if (response.ok) {
            alert(`【${currentReportData.customer_name}】的帳單已成功入帳！`);
            document.getElementById('saveReportBtn').style.display = 'none';
            document.getElementById('resultOutput').innerHTML = '';
            document.getElementById('reportInput').value = '';
            document.getElementById('action-area-content').style.display = 'none';
            document.getElementById('action-area-title').textContent = '請從上方列表選擇一位客戶';
            updateReconciliationStatus();
        } else {
            alert('入帳失敗！');
        }
    }
}

function importCustomers() {
    const fileInput = document.getElementById('customerFileInput');
    const file = fileInput.files[0];
    if (!file) { alert("請選擇 Excel 檔案！"); return; }
    const reader = new FileReader();
    reader.onload = async function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        const customerNames = json.map(row => String(row[0] || '')).filter(name => name);
        if (customerNames.length === 0) { alert("Excel 檔案中沒有找到客戶名稱！"); return; }
        const response = await fetch(`${API_URL}/customers/batch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ names: customerNames }) });
        const result = await response.json();
        let alertMessage = result.message || '';
        if (result.errors && result.errors.length > 0) { alertMessage += "\n\n遇到的問題：\n" + result.errors.join("\n"); }
        alert(alertMessage);
        fetchAndRenderCustomers();
        fileInput.value = '';
    };
    reader.readAsArrayBuffer(file);
}

function importItems() {
    const fileInput = document.getElementById('itemFileInput');
    const file = fileInput.files[0];
    if (!file) { alert("請選擇 Excel 檔案！"); return; }
    const reader = new FileReader();
    reader.onload = async function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: ['name', 'category'] });
        if (json.length > 0 && json[0].name === '項目名') { json.shift(); }
        if (json.length === 0) { alert("Excel 檔案中沒有找到項目資料！"); return; }
        const response = await fetch(`${API_URL}/items/batch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: json }) });
        const result = await response.json();
        let alertMessage = result.message || '';
        if (result.errors && result.errors.length > 0) { alertMessage += "\n\n遇到的問題：\n" + result.errors.join("\n"); }
        alert(alertMessage);
        fetchAndRenderItems();
        fileInput.value = '';
    };
    reader.readAsArrayBuffer(file);
}

async function updateReconciliationStatus() {
    const year = document.getElementById('yearSelect').value;
    const month = document.getElementById('monthSelect').value;
    const statusContainer = document.getElementById('reconciliation-status-list');
    const summaryActions = document.getElementById('summary-actions');
    
    document.getElementById('action-area-content').style.display = 'none';
    document.getElementById('action-area-title').textContent = '請從上方列表選擇一位客戶';

    if(!statusContainer || !summaryActions) return;
    statusContainer.innerHTML = '<p class="placeholder p-3">正在更新進度...</p>';
    summaryActions.style.display = 'none';

    try {
        const response = await fetch(`${API_URL}/reconciliation_status?year=${year}&month=${month}`);
        if (!response.ok) { statusContainer.innerHTML = '<p class="p-3">無法載入進度。</p>'; return; }
        const data = await response.json();
        statusContainer.innerHTML = ''; 

        data.status_list.forEach(item => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'status-item reconcilable-customer';
            itemDiv.id = `status-customer-${item.id}`;
            itemDiv.onclick = () => selectCustomerForReconciliation(item.id, item.name, item.status);
            itemDiv.innerHTML = `<div class="status-indicator ${item.status}"></div><span>${item.name} (${item.status === 'reconciled' ? '已對帳' : '未對帳'})</span>`;
            statusContainer.appendChild(itemDiv);
        });

        if (data.all_reconciled && data.status_list.length > 0) {
            summaryActions.style.display = 'block';
            document.getElementById('saveSummaryBtn').style.display = 'inline-block';
            document.getElementById('downloadSummaryBtn').style.display = 'none';
        }
    } catch (error) { 
        console.error("更新進度時出錯:", error); 
        statusContainer.innerHTML = '<p class="error p-3">更新進度時發生錯誤。</p>';
    }
}

function selectCustomerForReconciliation(customerId, customerName, status) {
    if (status === 'reconciled') {
        if (!confirm(`【${customerName}】在該月份已有對帳紀錄。\n\n您確定要重新生成帳單嗎？ (舊紀錄將會被覆蓋)`)) {
            return; 
        }
    }
    
    document.querySelectorAll('.reconcilable-customer').forEach(el => el.classList.remove('active'));
    document.getElementById(`status-customer-${customerId}`).classList.add('active');

    document.getElementById('reconCustomerSelect').value = customerId;
    document.getElementById('reportInput').value = '';
    document.getElementById('resultOutput').innerHTML = '';
    document.getElementById('saveReportBtn').style.display = 'none';
    
    document.getElementById('action-area-title').innerHTML = `▼ 正在為 <strong>【${customerName}】</strong> 對帳...`;
    const actionContent = document.getElementById('action-area-content');
    actionContent.style.display = 'block';

    const reportInput = document.getElementById('reportInput');
    reportInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    reportInput.focus();
}

async function saveMonthlySummary() {
    const year = document.getElementById('yearSelect').value;
    const month = document.getElementById('monthSelect').value;
    const saveBtn = document.getElementById('saveSummaryBtn');
    const downloadBtn = document.getElementById('downloadSummaryBtn');

    try {
        const checkResponse = await fetch(`${API_URL}/check_summary_exists?year=${year}&month=${month}`);
        const checkResult = await checkResponse.json();

        if (checkResult.exists) {
            if (!confirm(` ${year} 年 ${month} 月的總表已存在。\n您確定要覆蓋它嗎？`)) {
                return;
            }
        }

        saveBtn.textContent = '正在存入紀錄...';
        saveBtn.disabled = true;

        const saveResponse = await fetch(`${API_URL}/save_monthly_summary`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ year, month })
        });

        if (saveResponse.ok) {
            alert('總表已成功存入紀錄！');
            saveBtn.textContent = '紀錄已儲存';
            downloadBtn.style.display = 'inline-block';
            if (document.getElementById('summaries-view').style.display === 'block') {
                fetchAndRenderSummaries();
            }
        } else {
            const result = await saveResponse.json();
            alert(`存入紀錄失敗！\n錯誤訊息: ${result.error}`);
            saveBtn.textContent = '完成對帳並存入紀錄';
            saveBtn.disabled = false;
        }
    } catch (error) {
        console.error("存入總表時出錯:", error);
        alert("存入總表時發生客戶端錯誤，請查看主控台。");
        saveBtn.textContent = '完成對帳並存入紀錄';
        saveBtn.disabled = false;
    }
}

async function downloadMonthlySummary() {
    const year = document.getElementById('yearSelect').value;
    const month = document.getElementById('monthSelect').value;
    const downloadBtn = document.getElementById('downloadSummaryBtn');
    const originalText = downloadBtn.textContent;

    downloadBtn.textContent = '正在生成 Excel...';
    downloadBtn.disabled = true;
    try {
        const response = await fetch(`${API_URL}/download_monthly_summary?year=${year}&month=${month}`);
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none'; a.href = url;
            a.download = `${year}_${month}_monthly_summary.xlsx`;
            document.body.appendChild(a); a.click();
            window.URL.revokeObjectURL(url); a.remove();
        } else { 
            const result = await response.json();
            alert(`下載總表失敗！\n錯誤訊息: ${result.error}`);
        }
    } catch (error) {
        console.error("下載總表時出錯:", error);
        alert("下載總表時發生客戶端錯誤，請查看主控台。");
    } finally {
        downloadBtn.textContent = originalText;
        downloadBtn.disabled = false;
    }
}

async function fetchAndRenderSummaries() {
    const container = document.getElementById('summaries-list');
    container.innerHTML = '<p>正在從雲端載入歷史總表...</p>';
    const response = await fetch(`${API_URL}/historical_summaries`);
    const summaries = await response.json();
    if (!summaries || summaries.length === 0) {
        container.innerHTML = '<p>尚無任何歷史總表紀錄。</p>';
        return;
    }
    
    let tableHTML = `<table class="table table-striped"><thead><tr><th>年份</th><th>月份</th><th>稅後總營收</th><th>稅後總公司</th><th>稅後分公司</th><th>儲存時間</th><th>操作</th></tr></thead><tbody>`;
    summaries.forEach(summary => {
        tableHTML += `<tr>
            <td>${summary.year}</td>
            <td>${summary.month}</td>
            <td>$${summary.total_revenue_taxed_sum.toFixed(2)}</td>
            <td>$${summary.head_office_revenue_taxed_sum.toFixed(2)}</td>
            <td>$${summary.branch_office_revenue_taxed_sum.toFixed(2)}</td>
            <td>${new Date(summary.created_at).toLocaleString('zh-TW')}</td>
            <td><button class="btn btn-sm btn-danger" onclick="deleteMonthlySummary(${summary.year}, ${summary.month})">刪除</button></td>
        </tr>`;
    });
    tableHTML += `</tbody></table>`;
    container.innerHTML = tableHTML;
}

async function deleteMonthlySummary(year, month) {
    if (!confirm(`確定要刪除 ${year} 年 ${month} 月的總表紀錄嗎？\n此操作將無法復原。`)) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/monthly_summary`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ year, month })
        });

        if (response.ok) {
            alert('總表紀錄已成功刪除。');
            fetchAndRenderSummaries();
        } else {
            const result = await response.json();
            alert(`刪除失敗：${result.error}`);
        }
    } catch (error) {
        console.error("刪除總表時出錯:", error);
        alert("刪除總表時發生客戶端錯誤。");
    }
}

async function fetchAllBills() {
    const container = document.getElementById('all-bills-table-container');
    container.innerHTML = '<p>正在載入所有帳單...</p>';
    const year = document.getElementById('billYearFilter').value;
    const month = document.getElementById('billMonthFilter').value;
    const searchTerm = document.getElementById('billSearchInput').value;
    const query = new URLSearchParams({ year, month, search: searchTerm }).toString();
    const response = await fetch(`${API_URL}/all_reports?${query}`);
    const bills = await response.json();
    if (!bills || bills.length === 0) { container.innerHTML = '<p>找不到符合條件的帳單紀錄。</p>'; return; }
    
    let tableHTML = `<table class="table table-hover">
        <thead>
            <tr>
                <th>客戶名稱</th>
                <th>年份</th>
                <th>月份</th>
                <th>稅後總營收</th>
                <th>稅後總公司</th>
                <th>稅後分公司</th>
                <th>操作</th>
            </tr>
        </thead>
        <tbody>`;
    
    bills.forEach(bill => {
        const customerName = bill.customers ? bill.customers.name : '未知客戶';
        const totalRevenue = (bill.total_revenue_taxed || 0).toFixed(2);
        const headOfficeRevenue = (bill.head_office_revenue_taxed || 0).toFixed(2);
        const branchOfficeRevenue = (bill.branch_office_revenue_taxed || 0).toFixed(2);
        
        tableHTML += `
            <tr id="bill-row-${bill.id}" class="bill-row" onclick="toggleBillLineItems(${bill.id}, this)">
                <td>${customerName}</td>
                <td>${bill.year}</td>
                <td>${bill.month}</td>
                <td>${totalRevenue}</td>
                <td class="text-primary">${headOfficeRevenue}</td>
                <td class="text-info">${branchOfficeRevenue}</td>
                <td class="actions">
                    <button class="btn btn-sm btn-danger" onclick="deleteBill(${bill.id}, event)">刪除</button>
                </td>
            </tr>
            <tr id="details-row-${bill.id}" class="line-item-details-row">
                <td colspan="7" class="line-item-details-cell"></td>
            </tr>`;
    });
    
    tableHTML += `</tbody></table>`;
    container.innerHTML = tableHTML;
}

async function toggleBillLineItems(billId, rowElement) {
    const detailsRow = document.getElementById(`details-row-${billId}`);
    const isVisible = detailsRow.style.display === 'table-row';

    document.querySelectorAll('.line-item-details-row').forEach(row => row.style.display = 'none');
    document.querySelectorAll('.bill-row').forEach(row => row.classList.remove('active'));

    if (isVisible) {
        detailsRow.style.display = 'none';
        rowElement.classList.remove('active');
    } else {
        detailsRow.style.display = 'table-row';
        rowElement.classList.add('active');
        const cell = detailsRow.querySelector('td');
        cell.innerHTML = '<p>正在載入帳單明細...</p>';

        try {
            const response = await fetch(`${API_URL}/reports/${billId}/details`);
            if (!response.ok) throw new Error('Network response was not ok');
            const items = await response.json();
            if (items && items.length > 0) {
                let tableHTML = '<table class="table table-bordered inner-table"><thead><tr><th>項目</th><th>歸屬</th><th>單價</th><th>數量</th><th>總價</th></tr></thead><tbody>';
                items.forEach(item => {
                    const price = parseFloat(item.total_price) || 0;
                    tableHTML += `<tr><td>${item.item_name}</td><td>${item.category}</td><td>${item.unit_price}</td><td>${item.quantity}</td><td>$${price.toFixed(2)}</td></tr>`;
                });
                tableHTML += '</tbody></table>';
                cell.innerHTML = tableHTML;
            } else {
                cell.innerHTML = '<p>查無此帳單的消費明細。</p>';
            }
        } catch (error) {
            console.error("載入或渲染帳單明細時發生錯誤:", error);
            cell.innerHTML = '<p class="error">載入明細失敗，請檢查主控台 (Console) 錯誤訊息。</p>';
        }
    }
}

async function deleteBill(billId, event) {
    event.stopPropagation();
    if (confirm(`確定要永久刪除這筆帳單嗎？`)) {
        const response = await fetch(`${API_URL}/reports/${billId}`, { method: 'DELETE' });
        if (response.ok) { alert('帳單已成功刪除。'); fetchAllBills(); }
        else { alert('刪除失敗！'); }
    }
}

async function scrapeAndProcessReport() {
    const customerId = document.getElementById('reconCustomerSelect').value;
    if (!customerId) {
        alert('請先從列表選擇一位客戶！');
        return;
    }
    
    const year = document.getElementById('yearSelect').value;
    const month = document.getElementById('monthSelect').value;
    
    const reportInput = document.getElementById('reportInput');
    const resultDiv = document.getElementById('resultOutput');
    const saveBtn = document.getElementById('saveReportBtn');
    const scrapeBtn = document.getElementById('scrapeBtn');
    
    if (reportInput) {
        reportInput.value = '';
        console.log('已清空報表文字框');
    }
    
    if (resultDiv) {
        resultDiv.innerHTML = '';
    }
    
    if (saveBtn) {
        saveBtn.style.display = 'none';
    }
    
    currentReportData = null;
    
    resultDiv.innerHTML = `<p class="text-primary">🤖 正在自動從 WMS 系統抓取帳單，請稍候... (過程約需 15-30 秒)</p>`;
    
    if (scrapeBtn) {
        scrapeBtn.disabled = true;
        scrapeBtn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 抓取中...`;
    }

    try {
        const response = await fetch(`${API_URL}/scrape_and_process_report`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customer_id: parseInt(customerId), year, month })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || '未知的伺服器錯誤');
        }

        const result = await response.json();

        if (result.report_text) {
            reportInput.value = result.report_text;
            console.log("已自動將爬取到的報表內容填入文字區。");
        }

        const customerName = allCustomers.find(c => c.id == customerId).name;
        
        const totalRevenueTaxed = result.total_revenue_taxed || (result.total_revenue * 1.05);
        const headOfficeRevenueTaxed = result.head_office_revenue_taxed || (result.head_office_revenue * 1.05);
        const branchOfficeRevenueTaxed = result.branch_office_revenue_taxed || (result.branch_office_revenue * 1.05);
        
        const mainResultText = `對帳客戶：${customerName}
對帳月份：${year} 年 ${month} 月
--------------------------------
總營收：${result.total_revenue.toFixed(2)} （稅後：${totalRevenueTaxed.toFixed(2)}）

歸屬【總公司】：${result.head_office_revenue.toFixed(2)} （稅後：${headOfficeRevenueTaxed.toFixed(2)}）
歸屬【分公司】：${result.branch_office_revenue.toFixed(2)} （稅後：${branchOfficeRevenueTaxed.toFixed(2)}）`;
        
        // 分類項目
        const categorizedItems = categorizeDetailedItems(result.detailed_items);
        
        // 計算各Tab小計
        const tabSubtotals = calculateTabSubtotals(categorizedItems);
        
        // 新增Tab小計顯示
        const tabSummaryHTML = `
            <div class="card bg-light mt-3 mb-3">
                <div class="card-body">
                    <h6 class="card-title mb-3">各類明細統計：</h6>
                    <div class="row">
                        <div class="col-md-4">
                            <div class="text-primary">
                                <strong>款項明細：</strong><br>
                                ${tabSubtotals['款項明細'].before.toFixed(2)} （稅後：${tabSubtotals['款項明細'].after.toFixed(2)}）
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="text-warning">
                                <strong>其他應退數：</strong><br>
                                ${tabSubtotals['其他應退數'].before.toFixed(2)} （稅後：${tabSubtotals['其他應退數'].after.toFixed(2)}）
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="text-success">
                                <strong>其他應收數：</strong><br>
                                ${tabSubtotals['其他應收數'].before.toFixed(2)} （稅後：${tabSubtotals['其他應收數'].after.toFixed(2)}）
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
        
        // 建立Tab介面 - 使用時間戳確保唯一ID
        const uniqueId = Date.now();
        const tabsHTML = `
            <div class="card mt-3">
                <div class="card-header">
                    <ul class="nav nav-tabs card-header-tabs" role="tablist">
                        <li class="nav-item">
                            <button class="nav-link active" onclick="switchTab(event, 'detail-${uniqueId}')" type="button">
                                款項明細 
                                <span class="badge bg-primary">${categorizedItems['款項明細'].length}</span>
                            </button>
                        </li>
                        <li class="nav-item">
                            <button class="nav-link" onclick="switchTab(event, 'deduction-${uniqueId}')" type="button">
                                其他應退數 
                                <span class="badge bg-warning">${categorizedItems['其他應退數'].length}</span>
                            </button>
                        </li>
                        <li class="nav-item">
                            <button class="nav-link" onclick="switchTab(event, 'addition-${uniqueId}')" type="button">
                                其他應收數 
                                <span class="badge bg-success">${categorizedItems['其他應收數'].length}</span>
                            </button>
                        </li>
                    </ul>
                </div>
                <div class="card-body">
                    <div class="tab-content">
                        <div class="tab-pane show active" id="detail-${uniqueId}">
                            ${createTabDetailsHTML(categorizedItems['款項明細'])}
                        </div>
                        <div class="tab-pane" id="deduction-${uniqueId}" style="display:none;">
                            ${createTabDetailsHTML(categorizedItems['其他應退數'])}
                        </div>
                        <div class="tab-pane" id="addition-${uniqueId}" style="display:none;">
                            ${createTabDetailsHTML(categorizedItems['其他應收數'])}
                        </div>
                    </div>
                </div>
            </div>`;
        
        let statusHtml = '';
        let unclassifiedHtml = '';
        let nonTaxableHtml = '';
        let allowSave = false;
        
        if (result.detailed_items) {
            const nonTaxableItems = result.detailed_items.filter(item => {
                return item.item_name && item.item_name.includes("不計稅");
            });
            
            if (nonTaxableItems.length > 0) {
                const itemsList = nonTaxableItems.map(item => 
                    `<li>${item.item_name} - ${item.total_price.toFixed(2)}</li>`
                ).join('');
                nonTaxableHtml = `
                    <div class="alert alert-info mt-3">
                        <h5>ℹ️ 不計稅項目</h5>
                        <p>以下項目不需加計5%營業稅：</p>
                        <ul>${itemsList}</ul>
                    </div>`;
            }
        }
        
        let completionInfo = '<div class="mt-3">';
        
        if (result.failed_tabs && result.failed_tabs.length > 0) {
            completionInfo += `
                <div class="alert alert-danger">
                    <h5>❌ Tab爬取失敗警告</h5>
                    <p>以下Tab爬取失敗：<strong>${result.failed_tabs.join(', ')}</strong></p>
                    <p>請手動檢查這些Tab是否有資料，或重新執行爬取。</p>
                </div>`;
        }
        
        if (result.tab_breakdown) {
            completionInfo += `
                <div class="alert alert-info">
                    <h5>📊 各Tab資料統計</h5>
                    <table class="table table-sm mb-0">
                        <tr><td>款項明細：</td><td><strong>${result.tab_breakdown['款項明細'] || 0}</strong> 筆</td></tr>
                        <tr><td>其他應退款：</td><td><strong>${result.tab_breakdown['其他應退款'] || 0}</strong> 筆</td></tr>
                        <tr><td>其他應收款：</td><td><strong>${result.tab_breakdown['其他應收款'] || 0}</strong> 筆</td></tr>
                    </table>
                </div>`;
        }
        
        if (result.expected_count !== null && result.expected_count !== undefined && result.expected_count > 0) {
            const isComplete = result.actual_count === result.expected_count;
            const completionClass = isComplete ? 'success' : 'warning';
            const completionIcon = isComplete ? '✅' : '⚠️';
            
            completionInfo += `
                <div class="alert alert-${completionClass}">
                    <h5>${completionIcon} 資料抓取統計</h5>
                    <table class="table table-sm mb-2">
                        <tr>
                            <td>預期資料筆數：</td>
                            <td><strong>${result.expected_count}</strong> 筆</td>
                        </tr>
                        <tr>
                            <td>實際抓取筆數：</td>
                            <td><strong>${result.actual_count}</strong> 筆</td>
                        </tr>
                        <tr>
                            <td>完成率：</td>
                            <td><strong>${result.completion_rate ? result.completion_rate.toFixed(1) : '0'}%</strong></td>
                        </tr>
                    </table>`;
            
            if (isComplete) {
                completionInfo += `<div class="text-success"><strong>✅ 資料完整：筆數完全相符！</strong></div>`;
                allowSave = true;
            } else if (result.actual_count > result.expected_count) {
                const excess = result.actual_count - result.expected_count;
                completionInfo += `
                    <div class="text-warning">
                        <strong>⚠️ 注意：</strong>抓取筆數超過預期 <strong>${excess}</strong> 筆
                        <br>可能有重複資料，請檢查明細後再決定是否入帳。
                    </div>`;
                allowSave = true;
            } else {
                const missing = result.expected_count - result.actual_count;
                completionInfo += `
                    <div class="text-warning">
                        <strong>⚠️ 注意：</strong>缺少 <strong>${missing}</strong> 筆資料
                        <br>可能有遺漏，請確認資料完整性後再決定是否入帳。
                    </div>`;
                allowSave = true;
            }
            
            completionInfo += `</div>`;
            
        } else if (result.actual_count > 0) {
            completionInfo += `
                <div class="alert alert-info">
                    <h5>ℹ️ 資料抓取統計</h5>
                    <table class="table table-sm mb-2">
                        <tr>
                            <td>預期資料筆數：</td>
                            <td><strong>無法取得</strong></td>
                        </tr>
                        <tr>
                            <td>實際抓取筆數：</td>
                            <td><strong>${result.actual_count}</strong> 筆</td>
                        </tr>
                    </table>
                    <div class="text-info">
                        <strong>提醒：</strong>系統無法取得預期筆數，請手動確認資料是否完整。
                    </div>
                </div>`;
            allowSave = true;
        } else {
            completionInfo += `
                <div class="alert alert-danger">
                    <h5>❌ 未抓取到任何資料</h5>
                    <p>請確認該月份是否有帳單資料。</p>
                </div>`;
        }
        
        completionInfo += '</div>';
        
        if (result.unclassified_items && result.unclassified_items.length > 0) {
            const listItems = result.unclassified_items.map(item => `<li>${item}</li>`).join('');
            unclassifiedHtml = `
                <div class="alert alert-danger mt-3">
                    <h5>🚫 發現未分類項目</h5>
                    <p>以下項目尚未設定歸屬（總公司/分公司）：</p>
                    <ul>${listItems}</ul>
                    <hr>
                    <p><strong>解決方法：</strong>請先到「項目管理」頁面設定這些項目的歸屬，然後重新抓取。</p>
                </div>`;
            allowSave = false;
        }
        
        if (allowSave && !result.unclassified_items?.length) {
            saveBtn.style.display = 'inline-block';
            currentReportData = {
                customer_id: parseInt(customerId), 
                customer_name: customerName, 
                year, 
                month,
                total_revenue: result.total_revenue, 
                head_office_revenue: result.head_office_revenue,
                branch_office_revenue: result.branch_office_revenue,
                total_revenue_taxed: totalRevenueTaxed,
                head_office_revenue_taxed: headOfficeRevenueTaxed,
                branch_office_revenue_taxed: branchOfficeRevenueTaxed,
                detailed_items: result.detailed_items
            };
        }
        
        resultDiv.innerHTML = `
            <pre>${mainResultText}</pre>
            ${tabsHTML}
            ${completionInfo}
            ${statusHtml}
            ${unclassifiedHtml}
        `;

    } catch (error) {
        resultDiv.innerHTML = `
            <div class="alert alert-danger">
                <h5>❌ 抓取失敗</h5>
                <p>${error.message}</p>
            </div>`;
    } finally {
        if (scrapeBtn) {
            scrapeBtn.disabled = false;
            scrapeBtn.innerHTML = '🚀 自動抓取並計算帳單';
        }
    }
}

function populateBillFilters() {
    const yearFilter = document.getElementById('billYearFilter');
    const monthFilter = document.getElementById('billMonthFilter');
    if (yearFilter.options.length > 1) return;
    yearFilter.innerHTML = '<option value="all">所有年份</option>';
    monthFilter.innerHTML = '<option value="all">所有月份</option>';
    const currentYear = new Date().getFullYear();
    for (let i = currentYear + 5; i >= currentYear - 5; i--) { yearFilter.innerHTML += `<option value="${i}">${i} 年</option>`; }
    for (let i = 1; i <= 12; i++) { monthFilter.innerHTML += `<option value="${i}">${i} 月</option>`; }
}