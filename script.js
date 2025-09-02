const API_URL = 'http://127.0.0.1:5000';
let allCustomers = [], allItems = [], currentReportData = null;
let sortColumn = 'name', sortDirection = 'asc';

// 內聯編輯相關變數
let currentEditingElement = null;
let originalCategoryValue = null;
let editingItemOriginal = null;

// Tab切換函數（通用版本，同時支援各種Tab）
function switchTab(event, tabId) {
    event.preventDefault();
    event.stopPropagation();
    
    console.log('切換到Tab:', tabId);
    
    // 找到父容器
    const container = event.target.closest('.card');
    if (!container) {
        console.error('找不到Tab容器');
        return;
    }
    
    // 移除所有Tab按鈕的active類
    container.querySelectorAll('.nav-link').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // 隱藏所有Tab內容
    container.querySelectorAll('.tab-pane').forEach(pane => {
        pane.style.display = 'none';
        pane.classList.remove('show', 'active');
    });
    
    // 激活當前Tab按鈕
    event.target.classList.add('active');
    
    // 顯示對應的Tab內容
    const targetPane = document.getElementById(tabId);
    if (targetPane) {
        targetPane.style.display = 'block';
        targetPane.classList.add('show', 'active');
        console.log('Tab已切換到:', tabId);
    } else {
        console.error('找不到目標Tab內容:', tabId);
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
        deactivatedList.appendChild(itemDiv);
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

// 更新的表格渲染函數 - 支援內聯編輯
function renderItemsTable() {
    const tableBody = document.getElementById('itemTableBody');
    tableBody.innerHTML = '';
    
    allItems.forEach(item => {
        const row = tableBody.insertRow();
        
        // 項目名稱列 - 可點擊編輯
        const nameCell = row.insertCell(0);
        nameCell.innerHTML = `
            <div class="d-flex align-items-center">
                <span class="item-name" onclick="editItemName(${item.id}, '${item.name}', this)" 
                      style="cursor: pointer; min-width: 100px;" 
                      title="點擊修改名稱">
                    ${item.name}
                </span>
            </div>`;
        
        // 歸屬列 - 可點擊編輯
        const categoryCell = row.insertCell(1);
        const categoryBadgeClass = item.category === '總公司' ? 'bg-primary' : 'bg-info';
        categoryCell.innerHTML = `
            <span class="badge ${categoryBadgeClass} category-badge" 
                  onclick="editItemCategory(${item.id}, '${item.category}', this)" 
                  style="cursor: pointer; min-width: 80px;" 
                  title="點擊修改歸屬"
                  data-item-id="${item.id}" 
                  data-current-category="${item.category}">
                ${item.category}
            </span>`;
        
        // 操作按鈕列
        const actionsCell = row.insertCell(2);
        actionsCell.className = 'actions';
        actionsCell.innerHTML = `
            <button class="btn btn-sm btn-info me-1" 
                    onclick="editItem(${item.id}, '${item.name}', '${item.category}')"
                    title="編輯項目">
                修改
            </button>
            <button class="btn btn-sm btn-danger" 
                    onclick="deleteItem(${item.id})"
                    title="刪除項目">
                刪除
            </button>`;
    });
}

// 內聯編輯歸屬功能
function editItemCategory(itemId, currentCategory, element) {
    // 如果已經有正在編輯的元素，先取消它
    if (currentEditingElement) {
        cancelCategoryEdit();
    }
    
    // 保存當前編輯狀態
    currentEditingElement = element;
    originalCategoryValue = currentCategory;
    
    // 創建下拉選擇框
    const select = document.createElement('select');
    select.className = 'form-select form-select-sm';
    select.style.minWidth = '100px';
    
    // 添加選項
    const options = [
        { value: '總公司', text: '總公司' },
        { value: '分公司', text: '分公司' }
    ];
    
    options.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option.value;
        optionElement.textContent = option.text;
        optionElement.selected = option.value === currentCategory;
        select.appendChild(optionElement);
    });
    
    // 替換原始元素
    element.style.display = 'none';
    element.parentNode.appendChild(select);
    
    // 聚焦到選擇框
    select.focus();
    
    // 添加事件監聽器
    select.addEventListener('change', function() {
        saveCategoryChange(itemId, this.value, element, select);
    });
    
    select.addEventListener('blur', function() {
        // 延遲取消，允許change事件先觸發
        setTimeout(() => {
            if (currentEditingElement === element) {
                cancelCategoryEdit();
            }
        }, 150);
    });
    
    select.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            saveCategoryChange(itemId, this.value, element, select);
        } else if (e.key === 'Escape') {
            cancelCategoryEdit();
        }
    });
}

// 保存歸屬修改
async function saveCategoryChange(itemId, newCategory, badgeElement, selectElement) {
    if (newCategory === originalCategoryValue) {
        // 沒有變化，直接取消編輯
        cancelCategoryEdit();
        return;
    }
    
    try {
        // 禁用選擇框，顯示載入狀態
        selectElement.disabled = true;
        selectElement.style.opacity = '0.6';
        
        // 獲取項目資訊
        const item = allItems.find(item => item.id === itemId);
        if (!item) {
            throw new Error('找不到項目資訊');
        }
        
        // 發送更新請求
        const response = await fetch(`${API_URL}/items/${itemId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: item.name, category: newCategory })
        });
        
        if (response.ok) {
            // 更新成功，更新本地數據和界面
            item.category = newCategory;
            
            // 更新徽章
            const newBadgeClass = newCategory === '總公司' ? 'bg-primary' : 'bg-info';
            badgeElement.className = `badge ${newBadgeClass} category-badge`;
            badgeElement.textContent = newCategory;
            badgeElement.setAttribute('data-current-category', newCategory);
            
            // 顯示成功提示
            showToast(`項目「${item.name}」歸屬已修改為「${newCategory}」`, 'success');
            
            // 取消編輯狀態
            cancelCategoryEdit();
            
        } else {
            const error = await response.json();
            throw new Error(error.error || '修改失敗');
        }
        
    } catch (error) {
        console.error('修改項目歸屬時發生錯誤:', error);
        showToast(`修改失敗：${error.message}`, 'danger');
        
        // 恢復編輯狀態
        selectElement.disabled = false;
        selectElement.style.opacity = '1';
        selectElement.focus();
    }
}

// 取消歸屬編輯
function cancelCategoryEdit() {
    if (currentEditingElement) {
        // 移除選擇框
        const select = currentEditingElement.parentNode.querySelector('select');
        if (select) {
            select.remove();
        }
        
        // 顯示原始徽章
        currentEditingElement.style.display = 'inline-block';
        
        // 重置狀態
        currentEditingElement = null;
        originalCategoryValue = null;
    }
}

// 內聯編輯項目名稱功能
function editItemName(itemId, currentName, element) {
    // 如果已經有正在編輯的元素，先取消它
    if (currentEditingElement) {
        cancelCategoryEdit();
    }
    
    // 創建輸入框
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-control form-control-sm';
    input.value = currentName;
    input.style.minWidth = '150px';
    
    // 替換原始元素
    element.style.display = 'none';
    element.parentNode.appendChild(input);
    
    // 選中文本並聚焦
    input.select();
    input.focus();
    
    // 添加事件監聽器
    input.addEventListener('blur', function() {
        saveNameChange(itemId, this.value.trim(), currentName, element, input);
    });
    
    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            saveNameChange(itemId, this.value.trim(), currentName, element, input);
        } else if (e.key === 'Escape') {
            // 取消編輯
            input.remove();
            element.style.display = 'inline-block';
        }
    });
}

// 保存名稱修改
async function saveNameChange(itemId, newName, originalName, nameElement, inputElement) {
    if (!newName) {
        showToast('項目名稱不能為空', 'warning');
        inputElement.focus();
        return;
    }
    
    if (newName === originalName) {
        // 沒有變化，取消編輯
        inputElement.remove();
        nameElement.style.display = 'inline-block';
        return;
    }
    
    // 檢查重複名稱
    const existingItem = allItems.find(item => item.name === newName && item.id !== itemId);
    if (existingItem) {
        showToast('此項目名稱已存在', 'warning');
        inputElement.focus();
        return;
    }
    
    try {
        // 禁用輸入框
        inputElement.disabled = true;
        inputElement.style.opacity = '0.6';
        
        // 獲取項目資訊
        const item = allItems.find(item => item.id === itemId);
        if (!item) {
            throw new Error('找不到項目資訊');
        }
        
        // 發送更新請求
        const response = await fetch(`${API_URL}/items/${itemId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName, category: item.category })
        });
        
        if (response.ok) {
            // 更新成功
            item.name = newName;
            nameElement.textContent = newName;
            nameElement.setAttribute('onclick', `editItemName(${itemId}, '${newName}', this)`);
            
            showToast(`項目名稱已修改為「${newName}」`, 'success');
            
            // 移除輸入框，顯示新名稱
            inputElement.remove();
            nameElement.style.display = 'inline-block';
            
        } else {
            const error = await response.json();
            throw new Error(error.error || '修改失敗');
        }
        
    } catch (error) {
        console.error('修改項目名稱時發生錯誤:', error);
        showToast(`修改失敗：${error.message}`, 'danger');
        
        // 恢復輸入框
        inputElement.disabled = false;
        inputElement.style.opacity = '1';
        inputElement.focus();
    }
}

// 改進的Toast提示函數
function showToast(message, type = 'info') {
    // 移除現有的toast
    const existingToasts = document.querySelectorAll('.toast-notification');
    existingToasts.forEach(toast => toast.remove());
    
    // 創建新的toast
    const toast = document.createElement('div');
    toast.className = `alert alert-${type} alert-dismissible fade show position-fixed toast-notification`;
    toast.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);';
    
    // 圖標映射
    const icons = {
        success: '✓',
        danger: '✗',
        warning: '⚠',
        info: 'ℹ'
    };
    
    const icon = icons[type] || icons.info;
    
    toast.innerHTML = `
        <div class="d-flex align-items-center">
            <span class="me-2">${icon}</span>
            <span>${message}</span>
            <button type="button" class="btn-close ms-auto" onclick="this.parentElement.parentElement.remove()"></button>
        </div>
    `;
    
    document.body.appendChild(toast);
    
    // 3秒後自動移除
    setTimeout(() => {
        if (toast.parentNode) {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 150);
        }
    }, 3000);
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
    const password = prompt(`即將永久刪除客戶「${name}」！此操作無法復原，請輸入刪除密碼：`);
    if (password === null) return;
    if (!password) { alert("密碼不能為空！"); return; }
    const response = await fetch(`${API_URL}/customers/${id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: password }) });
    if (response.ok) { alert(`客戶「${name}」已成功刪除。`); await fetchAndRenderCustomers(); }
    else { const result = await response.json(); alert(`刪除失敗：${result.error}`); }
}

async function deactivateCustomer(id, name) {
    if (confirm(`確定要停用客戶「${name}」嗎？`)) {
        await fetch(`${API_URL}/customers/${id}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: false }) });
        await fetchAndRenderCustomers();
    }
}

async function reactivateCustomer(id, name) {
    if (confirm(`確定要重新啟用客戶「${name}」嗎？`)) {
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

// 模態框版本的editItem函數（保留作為備用選項）
async function editItem(id, currentName, currentCategory) {
    // 保存原始數據
    editingItemOriginal = { name: currentName, category: currentCategory };
    
    // 設置模態框內容
    document.getElementById('editItemId').value = id;
    document.getElementById('editItemName').value = currentName;
    document.getElementById('editItemCategory').value = currentCategory;
    
    // 顯示當前項目資訊
    document.getElementById('originalItemName').textContent = currentName;
    const categoryBadge = document.getElementById('originalItemCategory');
    categoryBadge.textContent = currentCategory;
    categoryBadge.className = currentCategory === '總公司' ? 'badge bg-primary' : 'badge bg-info';
    
    // 重置驗證狀態
    resetEditItemValidation();
    
    // 顯示模態框
    const modal = new bootstrap.Modal(document.getElementById('editItemModal'));
    modal.show();
}

// 重置編輯表單驗證狀態
function resetEditItemValidation() {
    const form = document.getElementById('editItemForm');
    const inputs = form.querySelectorAll('.form-control, .form-select');
    
    inputs.forEach(input => {
        input.classList.remove('is-invalid');
    });
    
    // 隱藏對比區域
    document.getElementById('editItemComparison').style.display = 'none';
    document.getElementById('nameComparisonRow').style.display = 'none';
    document.getElementById('categoryComparisonRow').style.display = 'none';
}

// 驗證編輯表單並顯示對比
function validateEditItemForm() {
    const itemId = parseInt(document.getElementById('editItemId').value);
    const itemName = document.getElementById('editItemName').value.trim();
    const itemCategory = document.getElementById('editItemCategory').value;
    
    let isValid = true;
    
    // 驗證項目名稱
    const nameInput = document.getElementById('editItemName');
    const nameError = document.getElementById('editItemNameError');
    
    if (!itemName) {
        nameInput.classList.add('is-invalid');
        nameError.textContent = '項目名稱不能為空！';
        isValid = false;
    } else {
        // 檢查重複名稱（排除自己）
        const existingItem = allItems.find(item => item.name === itemName && item.id !== itemId);
        if (existingItem) {
            nameInput.classList.add('is-invalid');
            nameError.textContent = '此項目名稱已存在！';
            isValid = false;
        } else {
            nameInput.classList.remove('is-invalid');
        }
    }
    
    // 驗證項目歸屬
    const categorySelect = document.getElementById('editItemCategory');
    const categoryError = document.getElementById('editItemCategoryError');
    
    if (!itemCategory) {
        categorySelect.classList.add('is-invalid');
        categoryError.textContent = '請選擇項目歸屬！';
        isValid = false;
    } else {
        categorySelect.classList.remove('is-invalid');
    }
    
    // 顯示修改對比
    if (isValid && editingItemOriginal) {
        const nameChanged = itemName !== editingItemOriginal.name;
        const categoryChanged = itemCategory !== editingItemOriginal.category;
        const hasChanges = nameChanged || categoryChanged;
        
        if (hasChanges) {
            // 顯示對比區域
            document.getElementById('editItemComparison').style.display = 'block';
            
            // 名稱對比
            if (nameChanged) {
                document.getElementById('nameComparisonRow').style.display = 'table-row';
                document.getElementById('nameOld').textContent = editingItemOriginal.name;
                document.getElementById('nameNew').textContent = itemName;
            } else {
                document.getElementById('nameComparisonRow').style.display = 'none';
            }
            
            // 歸屬對比
            if (categoryChanged) {
                document.getElementById('categoryComparisonRow').style.display = 'table-row';
                document.getElementById('categoryOld').textContent = editingItemOriginal.category;
                document.getElementById('categoryNew').textContent = itemCategory;
            } else {
                document.getElementById('categoryComparisonRow').style.display = 'none';
            }
        } else {
            document.getElementById('editItemComparison').style.display = 'none';
        }
    }
    
    return isValid;
}

// 保存編輯
async function saveEditItem() {
    if (!validateEditItemForm()) return;
    
    const itemId = parseInt(document.getElementById('editItemId').value);
    const itemName = document.getElementById('editItemName').value.trim();
    const itemCategory = document.getElementById('editItemCategory').value;
    
    // 檢查是否有修改
    const nameChanged = itemName !== editingItemOriginal.name;
    const categoryChanged = itemCategory !== editingItemOriginal.category;
    const hasChanges = nameChanged || categoryChanged;
    
    if (!hasChanges) {
        alert('沒有任何修改！');
        return;
    }
    
    const saveBtn = document.getElementById('saveEditItem');
    const originalText = saveBtn.textContent;
    
    try {
        saveBtn.disabled = true;
        saveBtn.textContent = '保存中...';
        
        const response = await fetch(`${API_URL}/items/${itemId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: itemName, category: itemCategory })
        });
        
        if (response.ok) {
            // 構建成功消息
            let successMessage = '項目修改成功！\n\n';
            if (nameChanged) {
                successMessage += `✓ 名稱：${editingItemOriginal.name} → ${itemName}\n`;
            }
            if (categoryChanged) {
                successMessage += `✓ 歸屬：${editingItemOriginal.category} → ${itemCategory}`;
            }
            
            alert(successMessage);
            
            // 關閉模態框
            const modal = bootstrap.Modal.getInstance(document.getElementById('editItemModal'));
            modal.hide();
            
            // 重新載入項目列表
            fetchAndRenderItems();
        } else {
            const error = await response.json();
            alert(`修改失敗：${error.error || '未知錯誤'}`);
        }
    } catch (error) {
        console.error('修改項目時發生錯誤:', error);
        alert('修改項目時發生網路錯誤！');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = originalText;
    }
}

async function deleteItem(id) {
    if (confirm('你確定要刪除這個項目嗎？')) {
        await fetch(`${API_URL}/items/${id}`, { method: 'DELETE' });
        fetchAndRenderItems();
    }
}

// 創建Tab詳細HTML函數
function createTabDetailsHTML(items, isDeduction = false) {
    if (!items || !Array.isArray(items) || items.length === 0) {
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
        if (!item) return;
        
        const itemName = item.item_name || '未知項目';
        let unitPrice = item.unit_price || '';
        const quantity = item.quantity || '';
        let totalPrice = parseFloat(item.total_price) || 0;
        const remark = item.remark || '';
        
        // 如果是應退款tab，處理負數顯示
        if (isDeduction) {
            if (totalPrice > 0) {
                totalPrice = -totalPrice;
            }
            
            if (unitPrice && !unitPrice.toString().startsWith('-') && !unitPrice.toString().startsWith('$-')) {
                if (unitPrice.toString().startsWith('$')) {
                    unitPrice = '$-' + unitPrice.substring(1);
                } else {
                    unitPrice = '-' + unitPrice;
                }
            }
        }
        
        subtotal += totalPrice;
        
        let priceDisplay;
        let priceClass = '';
        
        if (totalPrice < 0) {
            priceDisplay = `-$${Math.abs(totalPrice).toFixed(2)}`;
            priceClass = 'text-danger';
        } else {
            priceDisplay = `$${totalPrice.toFixed(2)}`;
        }
        
        let unitPriceDisplay = unitPrice;
        if (isDeduction || (unitPrice && unitPrice.toString().includes('-'))) {
            unitPriceDisplay = `<span class="text-danger">${unitPrice}</span>`;
        }
        
        html += `
            <tr>
                <td>${itemName}</td>
                <td>${unitPriceDisplay}</td>
                <td>${quantity}</td>
                <td class="text-end ${priceClass}">${priceDisplay}</td>
                <td>${remark}</td>
            </tr>`;
    });
    
    let subtotalDisplay;
    let subtotalClass = '';
    
    if (subtotal < 0) {
        subtotalDisplay = `-$${Math.abs(subtotal).toFixed(2)}`;
        subtotalClass = 'text-danger';
    } else {
        subtotalDisplay = `$${subtotal.toFixed(2)}`;
    }
    
    html += `
            </tbody>
            <tfoot>
                <tr class="table-info">
                    <td colspan="3" class="text-end"><strong>小計：</strong></td>
                    <td class="text-end"><strong class="${subtotalClass}">${subtotalDisplay}</strong></td>
                    <td></td>
                </tr>
            </tfoot>
        </table>`;
    
    return html;
}

function createCompanyDetailsHTML(items) {
    if (!items || !Array.isArray(items) || items.length === 0) {
        return '<p class="text-muted p-3">此分類無資料</p>';
    }
    
    let html = `
        <table class="table table-sm table-striped">
            <thead>
                <tr>
                    <th>項目名稱</th>
                    <th>類型</th>
                    <th>單價</th>
                    <th>數量</th>
                    <th class="text-end">總價</th>
                </tr>
            </thead>
            <tbody>`;
    
    let subtotal = 0;
    
    items.forEach(item => {
        if (!item) return;
        
        const itemName = item.item_name || '未知項目';
        const tabSource = item.tab_source || '款項明細';
        const unitPrice = item.unit_price || '';
        const quantity = item.quantity || '';
        let totalPrice = parseFloat(item.total_price) || 0;
        
        // 如果是應退款項目，確保為負數
        if (tabSource === '其他應退款' && totalPrice > 0) {
            totalPrice = -totalPrice;
        }
        
        subtotal += totalPrice;
        
        let priceDisplay;
        let priceClass = '';
        
        if (totalPrice < 0) {
            priceDisplay = `-$${Math.abs(totalPrice).toFixed(2)}`;
            priceClass = 'text-danger';
        } else {
            priceDisplay = `$${totalPrice.toFixed(2)}`;
        }
        
        let typeLabel = '';
        let typeClass = '';
        switch(tabSource) {
            case '其他應退款':
                typeLabel = '應退款';
                typeClass = 'badge bg-warning';
                break;
            case '其他應收款':
                typeLabel = '應收款';
                typeClass = 'badge bg-success';
                break;
            default:
                typeLabel = '一般款項';
                typeClass = 'badge bg-primary';
        }
        
        html += `
            <tr>
                <td>${itemName}</td>
                <td><span class="${typeClass}">${typeLabel}</span></td>
                <td>${unitPrice}</td>
                <td>${quantity}</td>
                <td class="text-end ${priceClass}">${priceDisplay}</td>
            </tr>`;
    });
    
    let subtotalDisplay;
    let subtotalClass = '';
    
    if (subtotal < 0) {
        subtotalDisplay = `-$${Math.abs(subtotal).toFixed(2)}`;
        subtotalClass = 'text-danger';
    } else {
        subtotalDisplay = `$${subtotal.toFixed(2)}`;
    }
    
    html += `
            </tbody>
            <tfoot>
                <tr class="table-info">
                    <td colspan="4" class="text-end"><strong>小計：</strong></td>
                    <td class="text-end"><strong class="${subtotalClass}">${subtotalDisplay}</strong></td>
                </tr>
            </tfoot>
        </table>`;
    
    return html;
}

// 簡化的分類函數 - 只看 tab_source
function categorizeDetailedItems(items) {
    const categories = {
        '款項明細': [],
        '其他應退款': [],
        '其他應收款': []
    };
    
    if (!items || !Array.isArray(items)) {
        console.log('警告：items 不是有效的數組');
        return categories;
    }
    
    console.log('===== 開始分類項目（簡化版）=====');
    console.log('總項目數：', items.length);
    
    items.forEach((item, index) => {
        if (!item || typeof item !== 'object') {
            console.log(`跳過無效項目 ${index}:`, item);
            return;
        }
        
        const tabSource = item.tab_source ? item.tab_source.trim() : '';
        
        if (index < 5) {
            console.log(`項目${index + 1}: ${item.item_name} | 來源Tab: ${tabSource}`);
        }
        
        switch(tabSource) {
            case '款項明細':
                categories['款項明細'].push(item);
                break;
            case '其他應退款':
                categories['其他應退款'].push(item);
                break;
            case '其他應收款':
                categories['其他應收款'].push(item);
                break;
            default:
                console.log(`警告：項目 "${item.item_name}" 沒有有效的 tab_source (${tabSource})，放入款項明細`);
                categories['款項明細'].push(item);
                break;
        }
    });
    
    console.log('===== 分類結果 =====');
    console.log('款項明細：', categories['款項明細'].length, '筆');
    console.log('其他應退款：', categories['其他應退款'].length, '筆');  
    console.log('其他應收款：', categories['其他應收款'].length, '筆');
    
    return categories;
}

// 按公司分類函數
function categorizeByCompany(items) {
    const categories = {
        '總公司': [],
        '分公司': [],
        '未分類': []
    };
    
    if (!items || !Array.isArray(items)) {
        return categories;
    }
    
    items.forEach(item => {
        const category = item.category || '';
        
        switch(category) {
            case '總公司':
                categories['總公司'].push(item);
                break;
            case '分公司':
                categories['分公司'].push(item);
                break;
            default:
                categories['未分類'].push(item);
                break;
        }
    });
    
    return categories;
}

// 計算Tab小計
function calculateTabSubtotals(categorizedItems) {
    const subtotals = {
        '款項明細': { before: 0, after: 0 },
        '其他應退款': { before: 0, after: 0 },
        '其他應收款': { before: 0, after: 0 }
    };
    
    if (!categorizedItems) return subtotals;
    
    Object.keys(categorizedItems).forEach(category => {
        if (!Array.isArray(categorizedItems[category])) return;
        
        let beforeTax = 0;
        let afterTax = 0;
        
        categorizedItems[category].forEach(item => {
            if (!item) return;
            
            let price = parseFloat(item.total_price) || 0;
            
            // 如果是其他應退款，確保價格為負數
            if (category === '其他應退款' && price > 0) {
                price = -price;
            }
            
            beforeTax += price;
            
            // 檢查是否為不計稅項目
            const isNonTaxable = item.is_non_taxable || 
                                 (item.item_name && item.item_name.includes('不計稅'));
            
            if (isNonTaxable) {
                // 不計稅項目，稅後等於稅前
                afterTax += price;
            } else {
                // 需計稅項目
                // 重要：無論正負數，都是乘以1.05
                // 正數：100 * 1.05 = 105（增加5%稅）
                // 負數：-100 * 1.05 = -105（退款也要退5%稅）
                afterTax += price * 1.05;
            }
        });
        
        subtotals[category].before = beforeTax;
        subtotals[category].after = afterTax;
    });
    
    console.log('Tab小計計算結果:', subtotals);
    return subtotals;
}

// 計算公司小計函數
function calculateCompanySubtotals(categorizedByCompany) {
    const subtotals = {
        '總公司': { before: 0, after: 0 },
        '分公司': { before: 0, after: 0 },
        '未分類': { before: 0, after: 0 }
    };
    
    if (!categorizedByCompany) return subtotals;
    
    Object.keys(categorizedByCompany).forEach(company => {
        if (!Array.isArray(categorizedByCompany[company])) return;
        
        let beforeTax = 0;
        let afterTax = 0;
        
        categorizedByCompany[company].forEach(item => {
            if (!item) return;
            
            let price = parseFloat(item.total_price) || 0;
            
            // 如果是應退款項目，確保為負數
            if (item.tab_source === '其他應退款' && price > 0) {
                price = -price;
            }
            
            beforeTax += price;
            
            // 檢查是否為不計稅項目
            const isNonTaxable = item.is_non_taxable || 
                                 (item.item_name && item.item_name.includes('不計稅'));
            
            if (isNonTaxable) {
                // 不計稅項目，稅後等於稅前
                afterTax += price;
            } else {
                // 需計稅項目，直接乘以1.05
                afterTax += price * 1.05;
            }
        });
        
        subtotals[company].before = beforeTax;
        subtotals[company].after = afterTax;
    });
    
    console.log('公司小計計算結果:', subtotals);
    return subtotals;
}

// 統計一致性檢查函數
function verifyTotals(categorizedByTab, categorizedByCompany) {
    // 計算Tab方式的總和
    let tabTotal = 0;
    let tabTotalTaxed = 0;
    
    Object.values(categorizedByTab).forEach(items => {
        items.forEach(item => {
            let price = parseFloat(item.total_price) || 0;
            if (item.tab_source === '其他應退款' && price > 0) {
                price = -price;
            }
            tabTotal += price;
            
            const isNonTaxable = item.is_non_taxable || 
                                 (item.item_name && item.item_name.includes('不計稅'));
            if (isNonTaxable) {
                tabTotalTaxed += price;
            } else {
                tabTotalTaxed += price * 1.05;
            }
        });
    });
    
    // 計算公司方式的總和
    let companyTotal = 0;
    let companyTotalTaxed = 0;
    
    Object.values(categorizedByCompany).forEach(items => {
        items.forEach(item => {
            let price = parseFloat(item.total_price) || 0;
            if (item.tab_source === '其他應退款' && price > 0) {
                price = -price;
            }
            companyTotal += price;
            
            const isNonTaxable = item.is_non_taxable || 
                                 (item.item_name && item.item_name.includes('不計稅'));
            if (isNonTaxable) {
                companyTotalTaxed += price;
            } else {
                companyTotalTaxed += price * 1.05;
            }
        });
    });
    
    console.log('===== 統計一致性檢查 =====');
    console.log('Tab分類總計：', tabTotal.toFixed(2));
    console.log('Tab分類稅後：', tabTotalTaxed.toFixed(2));
    console.log('公司分類總計：', companyTotal.toFixed(2));
    console.log('公司分類稅後：', companyTotalTaxed.toFixed(2));
    
    if (Math.abs(tabTotal - companyTotal) > 0.01) {
        console.error('警告：Tab分類和公司分類的總計不一致！');
    }
    if (Math.abs(tabTotalTaxed - companyTotalTaxed) > 0.01) {
        console.error('警告：Tab分類和公司分類的稅後總計不一致！');
    }
    
    return {
        tabTotal,
        tabTotalTaxed,
        companyTotal,
        companyTotalTaxed
    };
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

歸屬「總公司」：${result.head_office_revenue.toFixed(2)} （稅後：${headOfficeRevenueTaxed.toFixed(2)}）
歸屬「分公司」：${result.branch_office_revenue.toFixed(2)} （稅後：${branchOfficeRevenueTaxed.toFixed(2)}）`;
    
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
                            ${tabSubtotals['款項明細'].before.toFixed(2)} 
                            <small class="text-muted">（稅後：${tabSubtotals['款項明細'].after.toFixed(2)}）</small>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="text-warning">
                            <strong>其他應退款：</strong><br>
                            <span class="text-danger">${tabSubtotals['其他應退款'].before.toFixed(2)}</span>
                            <small class="text-muted">（稅後：${tabSubtotals['其他應退款'].after.toFixed(2)}）</small>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="text-success">
                            <strong>其他應收款：</strong><br>
                            ${tabSubtotals['其他應收款'].before.toFixed(2)} 
                            <small class="text-muted">（稅後：${tabSubtotals['其他應收款'].after.toFixed(2)}）</small>
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
                            其他應退款 
                            <span class="badge bg-warning">${categorizedItems['其他應退款'].length}</span>
                        </button>
                    </li>
                    <li class="nav-item">
                        <button class="nav-link" onclick="switchTab(event, 'addition-${uniqueId}')" type="button">
                            其他應收款 
                            <span class="badge bg-success">${categorizedItems['其他應收款'].length}</span>
                        </button>
                    </li>
                </ul>
            </div>
            <div class="card-body">
                <div class="tab-content">
                    <div class="tab-pane show active" id="detail-${uniqueId}">
                        ${createTabDetailsHTML(categorizedItems['款項明細'], false)}
                    </div>
                    <div class="tab-pane" id="deduction-${uniqueId}" style="display:none;">
                        ${createTabDetailsHTML(categorizedItems['其他應退款'], true)}
                    </div>
                    <div class="tab-pane" id="addition-${uniqueId}" style="display:none;">
                        ${createTabDetailsHTML(categorizedItems['其他應收款'], false)}
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
    if (confirm(`確定入帳「${currentReportData.customer_name} - ${currentReportData.year}年${currentReportData.month}月」嗎？`)) {
        const response = await fetch(`${API_URL}/save_report`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(currentReportData) });
        if (response.ok) {
            alert(`「${currentReportData.customer_name}」的帳單已成功入帳！`);
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
        if (!confirm(`「${customerName}」在該月份已有對帳紀錄。\n\n您確定要重新生成帳單嗎？ (舊紀錄將會被覆蓋)`)) {
            return; 
        }
    }
    
    document.querySelectorAll('.reconcilable-customer').forEach(el => el.classList.remove('active'));
    document.getElementById(`status-customer-${customerId}`).classList.add('active');

    document.getElementById('reconCustomerSelect').value = customerId;
    document.getElementById('reportInput').value = '';
    document.getElementById('resultOutput').innerHTML = '';
    document.getElementById('saveReportBtn').style.display = 'none';
    
    document.getElementById('action-area-title').innerHTML = `▼ 正在為 <strong>「${customerName}」</strong> 對帳...`;
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

// 修正 fetchAllBills 函數 - 確保onclick正確傳遞參數
async function fetchAllBills() {
    console.log('開始載入所有帳單...');
    const container = document.getElementById('all-bills-table-container');
    container.innerHTML = '<p>正在載入所有帳單...</p>';
    
    const year = document.getElementById('billYearFilter').value;
    const month = document.getElementById('billMonthFilter').value;
    const searchTerm = document.getElementById('billSearchInput').value;
    const query = new URLSearchParams({ year, month, search: searchTerm }).toString();
    
    try {
        const response = await fetch(`${API_URL}/all_reports?${query}`);
        const bills = await response.json();
        console.log('載入帳單數量:', bills ? bills.length : 0);
        
        if (!bills || bills.length === 0) { 
            container.innerHTML = '<p>找不到符合條件的帳單紀錄。</p>'; 
            return; 
        }
        
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
                <tr id="bill-row-${bill.id}" class="bill-row" style="cursor: pointer;">
                    <td onclick="toggleBillLineItems(${bill.id})">${customerName}</td>
                    <td onclick="toggleBillLineItems(${bill.id})">${bill.year}</td>
                    <td onclick="toggleBillLineItems(${bill.id})">${bill.month}</td>
                    <td onclick="toggleBillLineItems(${bill.id})">${totalRevenue}</td>
                    <td onclick="toggleBillLineItems(${bill.id})" class="text-primary">${headOfficeRevenue}</td>
                    <td onclick="toggleBillLineItems(${bill.id})" class="text-info">${branchOfficeRevenue}</td>
                    <td class="actions">
                        <button class="btn btn-sm btn-danger" onclick="deleteBill(${bill.id}, event)">刪除</button>
                    </td>
                </tr>
                <tr id="details-row-${bill.id}" class="line-item-details-row" style="display: none;">
                    <td colspan="7" class="line-item-details-cell"></td>
                </tr>`;
        });
        
        tableHTML += `</tbody></table>`;
        container.innerHTML = tableHTML;
        console.log('帳單表格已渲染完成');
    } catch (error) {
        console.error('載入帳單時發生錯誤:', error);
        container.innerHTML = '<p class="error">載入帳單失敗，請檢查控制台錯誤訊息。</p>';
    }
}

// 主要的展開函數 - 雙層Tab設計
async function toggleBillLineItems(billId, rowElement) {
    console.log('開始展開帳單明細，billId:', billId);
    
    if (window.event && window.event.target && window.event.target.tagName === 'BUTTON') {
        return;
    }
    
    if (!rowElement) {
        rowElement = document.getElementById(`bill-row-${billId}`);
    }
    
    const detailsRow = document.getElementById(`details-row-${billId}`);
    
    if (!detailsRow || !rowElement) {
        console.error('找不到必要的元素');
        return;
    }
    
    const isVisible = detailsRow.style.display === 'table-row';

    document.querySelectorAll('.line-item-details-row').forEach(row => {
        if (row.id !== `details-row-${billId}`) {
            row.style.display = 'none';
        }
    });
    document.querySelectorAll('.bill-row').forEach(row => {
        if (row.id !== `bill-row-${billId}`) {
            row.classList.remove('active');
        }
    });

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
            console.log('API響應狀態:', response.status);
            
            if (!response.ok) {
                throw new Error(`API回傳錯誤: ${response.status}`);
            }
            
            const items = await response.json();
            console.log('獲取到的明細項目數:', items ? items.length : 0);
            
            if (items && items.length > 0) {
                // 分類數據
                const categorizedByTab = categorizeDetailedItems(items);
                const categorizedByCompany = categorizeByCompany(items);
                
                // 計算小計
                const tabSubtotals = calculateTabSubtotals(categorizedByTab);
                const companySubtotals = calculateCompanySubtotals(categorizedByCompany);
                // 在計算小計後加入
                const validation = verifyTotals(categorizedByTab, categorizedByCompany);
                const uniqueId = Date.now();
                
                let tabsHTML = `
                    <!-- 第一層：按款項類型分類 -->
                    <div class="card border-0 mb-4">
                        <div class="card-header bg-light">
                            <h6 class="mb-0 text-muted">按款項類型分類</h6>
                        </div>
                        <div class="card-header bg-transparent">
                            <ul class="nav nav-tabs card-header-tabs" role="tablist">
                                <li class="nav-item">
                                    <button class="nav-link active" onclick="switchTab(event, 'bill-detail-${uniqueId}')" type="button">
                                        款項明細 
                                        <span class="badge bg-primary">${categorizedByTab['款項明細'].length}</span>
                                    </button>
                                </li>
                                <li class="nav-item">
                                    <button class="nav-link" onclick="switchTab(event, 'bill-deduction-${uniqueId}')" type="button">
                                        其他應退款 
                                        <span class="badge bg-warning">${categorizedByTab['其他應退款'].length}</span>
                                    </button>
                                </li>
                                <li class="nav-item">
                                    <button class="nav-link" onclick="switchTab(event, 'bill-addition-${uniqueId}')" type="button">
                                        其他應收款 
                                        <span class="badge bg-success">${categorizedByTab['其他應收款'].length}</span>
                                    </button>
                                </li>
                            </ul>
                        </div>
                        <div class="card-body">
                            <div class="tab-content">
                                <div class="tab-pane show active" id="bill-detail-${uniqueId}">
                                    ${createTabDetailsHTML(categorizedByTab['款項明細'], false)}
                                </div>
                                <div class="tab-pane" id="bill-deduction-${uniqueId}" style="display:none;">
                                    ${createTabDetailsHTML(categorizedByTab['其他應退款'], true)}
                                </div>
                                <div class="tab-pane" id="bill-addition-${uniqueId}" style="display:none;">
                                    ${createTabDetailsHTML(categorizedByTab['其他應收款'], false)}
                                </div>
                            </div>
                        </div>
                        
                        <div class="card-footer bg-light">
                            <div class="row text-center">
                                <div class="col-md-4">
                                    <small class="text-muted">款項明細小計</small><br>
                                    <strong>${tabSubtotals['款項明細'].before.toFixed(2)}</strong>
                                    <small class="text-muted">（稅後：${tabSubtotals['款項明細'].after.toFixed(2)}）</small>
                                </div>
                                <div class="col-md-4">
                                    <small class="text-muted">其他應退款小計</small><br>
                                    <strong class="text-danger">${tabSubtotals['其他應退款'].before.toFixed(2)}</strong>
                                    <small class="text-muted">（稅後：${tabSubtotals['其他應退款'].after.toFixed(2)}）</small>
                                </div>
                                <div class="col-md-4">
                                    <small class="text-muted">其他應收款小計</small><br>
                                    <strong>${tabSubtotals['其他應收款'].before.toFixed(2)}</strong>
                                    <small class="text-muted">（稅後：${tabSubtotals['其他應收款'].after.toFixed(2)}）</small>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- 第二層：按公司歸屬分類 -->
                    <div class="card border-0">
                        <div class="card-header bg-light">
                            <h6 class="mb-0 text-muted">按公司歸屬分類</h6>
                        </div>
                        <div class="card-header bg-transparent">
                            <ul class="nav nav-tabs card-header-tabs" role="tablist">
                                <li class="nav-item">
                                    <button class="nav-link active" onclick="switchTab(event, 'company-head-${uniqueId}')" type="button">
                                        總公司 
                                        <span class="badge bg-info">${categorizedByCompany['總公司'].length}</span>
                                    </button>
                                </li>
                                <li class="nav-item">
                                    <button class="nav-link" onclick="switchTab(event, 'company-branch-${uniqueId}')" type="button">
                                        分公司 
                                        <span class="badge bg-secondary">${categorizedByCompany['分公司'].length}</span>
                                    </button>
                                </li>
                                <li class="nav-item">
                                    <button class="nav-link" onclick="switchTab(event, 'company-unclassified-${uniqueId}')" type="button">
                                        未分類 
                                        <span class="badge bg-danger">${categorizedByCompany['未分類'].length}</span>
                                    </button>
                                </li>
                            </ul>
                        </div>
                        <div class="card-body">
                            <div class="tab-content">
                                <div class="tab-pane show active" id="company-head-${uniqueId}">
                                    ${createCompanyDetailsHTML(categorizedByCompany['總公司'])}
                                </div>
                                <div class="tab-pane" id="company-branch-${uniqueId}" style="display:none;">
                                    ${createCompanyDetailsHTML(categorizedByCompany['分公司'])}
                                </div>
                                <div class="tab-pane" id="company-unclassified-${uniqueId}" style="display:none;">
                                    ${createCompanyDetailsHTML(categorizedByCompany['未分類'])}
                                </div>
                            </div>
                        </div>
                        
                        <div class="card-footer bg-light">
                            <div class="row text-center">
                                <div class="col-md-4">
                                    <small class="text-muted">總公司小計</small><br>
                                    <strong>${companySubtotals['總公司'].before.toFixed(2)}</strong>
                                    <small class="text-muted">（稅後：${companySubtotals['總公司'].after.toFixed(2)}）</small>
                                </div>
                                <div class="col-md-4">
                                    <small class="text-muted">分公司小計</small><br>
                                    <strong>${companySubtotals['分公司'].before.toFixed(2)}</strong>
                                    <small class="text-muted">（稅後：${companySubtotals['分公司'].after.toFixed(2)}）</small>
                                </div>
                                <div class="col-md-4">
                                    <small class="text-muted">總計</small><br>
                                    <strong>${(companySubtotals['總公司'].before + companySubtotals['分公司'].before).toFixed(2)}</strong>
                                    <small class="text-muted">（稅後：${(companySubtotals['總公司'].after + companySubtotals['分公司'].after).toFixed(2)}）</small>
                                </div>
                            </div>
                        </div>
                    </div>`;
                
                cell.innerHTML = tabsHTML;
                console.log('雙層Tab介面已成功插入');
            } else {
                cell.innerHTML = '<p>查無此帳單的消費明細。</p>';
            }
        } catch (error) {
            console.error("載入或渲染帳單明細時發生錯誤:", error);
            const cell = detailsRow.querySelector('td');
            cell.innerHTML = `<p class="error">載入明細失敗：${error.message}</p>`;
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

// 簡化版的 scrapeAndProcessReport 函數
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

歸屬「總公司」：${result.head_office_revenue.toFixed(2)} （稅後：${headOfficeRevenueTaxed.toFixed(2)}）
歸屬「分公司」：${result.branch_office_revenue.toFixed(2)} （稅後：${branchOfficeRevenueTaxed.toFixed(2)}）`;
        
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
                                ${tabSubtotals['款項明細'].before.toFixed(2)} 
                                <small class="text-muted">（稅後：${tabSubtotals['款項明細'].after.toFixed(2)}）</small>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="text-warning">
                                <strong>其他應退款：</strong><br>
                                <span class="text-danger">${tabSubtotals['其他應退款'].before.toFixed(2)}</span>
                                <small class="text-muted">（稅後：${tabSubtotals['其他應退款'].after.toFixed(2)}）</small>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="text-success">
                                <strong>其他應收款：</strong><br>
                                ${tabSubtotals['其他應收款'].before.toFixed(2)} 
                                <small class="text-muted">（稅後：${tabSubtotals['其他應收款'].after.toFixed(2)}）</small>
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
                                其他應退款 
                                <span class="badge bg-warning">${categorizedItems['其他應退款'].length}</span>
                            </button>
                        </li>
                        <li class="nav-item">
                            <button class="nav-link" onclick="switchTab(event, 'addition-${uniqueId}')" type="button">
                                其他應收款 
                                <span class="badge bg-success">${categorizedItems['其他應收款'].length}</span>
                            </button>
                        </li>
                    </ul>
                </div>
                <div class="card-body">
                    <div class="tab-content">
                        <div class="tab-pane show active" id="detail-${uniqueId}">
                            ${createTabDetailsHTML(categorizedItems['款項明細'], false)}
                        </div>
                        <div class="tab-pane" id="deduction-${uniqueId}" style="display:none;">
                            ${createTabDetailsHTML(categorizedItems['其他應退款'], true)}
                        </div>
                        <div class="tab-pane" id="addition-${uniqueId}" style="display:none;">
                            ${createTabDetailsHTML(categorizedItems['其他應收款'], false)}
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
        
        let completionInfo = '';
        
        // 只在資料有問題時顯示警告
        if (result.actual_count === 0) {
            // 完全沒抓到資料
            completionInfo = `
                <div class="alert alert-danger mt-3">
                    <h5>❌ 未抓取到任何資料</h5>
                    <p>請確認該月份是否有帳單資料。</p>
                </div>`;
        } else if (result.expected_count !== null && result.expected_count !== undefined && result.expected_count > 0) {
            // 有預期筆數且不一致時才顯示
            if (result.actual_count !== result.expected_count) {
                const isOver = result.actual_count > result.expected_count;
                const diff = Math.abs(result.actual_count - result.expected_count);
                const completionClass = isOver ? 'warning' : 'warning';
                const completionIcon = '⚠️';
                
                completionInfo = `
                    <div class="alert alert-${completionClass} mt-3">
                        <h5>${completionIcon} 資料筆數不一致</h5>
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
                                <td>差異：</td>
                                <td><strong>${isOver ? '+' : '-'}${diff}</strong> 筆</td>
                            </tr>
                        </table>
                        <div class="text-warning">
                            ${isOver ? 
                                `<strong>注意：</strong>抓取筆數超過預期，可能有重複資料，請檢查明細後再決定是否入帳。` :
                                `<strong>注意：</strong>缺少 ${diff} 筆資料，可能有遺漏，請確認資料完整性後再決定是否入帳。`
                            }
                        </div>
                    </div>`;
            }
            allowSave = true;
        } else {
            // 沒有預期筆數但有抓到資料，不顯示警告，直接允許存檔
            allowSave = true;
        }
        
        // 未分類項目警告（這個保留）
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

// 點擊其他地方取消編輯
document.addEventListener('click', function(e) {
    // 如果點擊的不是正在編輯的元素或其子元素，取消編輯
    if (currentEditingElement && 
        !currentEditingElement.contains(e.target) && 
        !e.target.closest('select') && 
        !e.target.closest('.form-control')) {
        cancelCategoryEdit();
    }
});

// 事件監聽器（模態框版本）
document.addEventListener('DOMContentLoaded', function() {
    // 編輯表單實時驗證
    const editItemName = document.getElementById('editItemName');
    const editItemCategory = document.getElementById('editItemCategory');
    
    if (editItemName) {
        editItemName.addEventListener('input', validateEditItemForm);
    }
    
    if (editItemCategory) {
        editItemCategory.addEventListener('change', validateEditItemForm);
    }
    
    // 保存按鈕事件
    const saveBtn = document.getElementById('saveEditItem');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveEditItem);
    }
});