# =================================================================
# 檔案：app.py (包含不計稅項目處理邏輯)
# =================================================================

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from supabase import create_client, Client
from scraper import scrape_monthly_bill
import pandas as pd
import io
import os
import re
import traceback

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

# 請替換成您自己的 Supabase URL 和 Key
SUPABASE_URL = "https://rdqmvulftfpmvpjdicmk.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkcW12dWxmdGZwbXZwamRpY21rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU3NTY1NjcsImV4cCI6MjA3MTMzMjU2N30.ZRbnWjo1gRoyac1rNePztJje7qbXsuTVoZaRrn5LRS0"
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# 請設定您自己的刪除密碼
DELETE_PASSWORD = "93559091"

# --- 客戶管理 API ---
@app.route('/customers', methods=['GET'])
def get_customers():
    response = supabase.table('customers').select('*').order('is_active', desc=True).order('id').execute()
    return jsonify(response.data)

@app.route('/customers/<int:customer_id>/status', methods=['PUT'])
def update_customer_status(customer_id):
    data = request.get_json()
    is_active_status = data.get('is_active')
    if is_active_status is None:
        return jsonify({"error": "未提供狀態"}), 400
    response = supabase.table('customers').update({'is_active': is_active_status}).eq('id', customer_id).execute()
    if not response.data:
        return jsonify({"error": "找不到客戶"}), 404
    return jsonify(response.data[0])

@app.route('/customers/<int:customer_id>', methods=['DELETE'])
def delete_customer(customer_id):
    data = request.get_json()
    password = data.get('password')
    if password != DELETE_PASSWORD:
        return jsonify({"error": "密碼錯誤"}), 403
    response = supabase.table('customers').delete().eq('id', customer_id).execute()
    if not response.data:
        return jsonify({"error": "找不到客戶"}), 404
    return jsonify({"success": True})

@app.route('/customers', methods=['POST'])
def add_customer():
    data = request.get_json()
    name = data.get('name', '').strip()
    if not name:
        return jsonify({"error": "客戶名稱不能是空的"}), 400
    existing = supabase.table('customers').select('id').eq('name', name).execute()
    if existing.data:
        return jsonify({"error": "此客戶名稱已存在"}), 409
    response = supabase.table('customers').insert({'name': name}).execute()
    return jsonify(response.data[0]), 201

@app.route('/customers/batch', methods=['POST'])
def add_customers_batch():
    data = request.get_json()
    names = data.get('names', [])
    if not names:
        return jsonify({"error": "沒有提供客戶名稱列表"}), 400
    new_customers_to_insert = []
    errors = []
    existing_response = supabase.table('customers').select('name').execute()
    existing_names = {c['name'] for c in existing_response.data}
    for name in names:
        clean_name = name.strip()
        if not clean_name:
            errors.append(f"'{name}' 為空值，已跳過。")
        elif clean_name in existing_names:
            errors.append(f"'{name}' 已存在，已跳過。")
        else:
            new_customers_to_insert.append({'name': clean_name})
            existing_names.add(clean_name)
    if not new_customers_to_insert:
        return jsonify({"success": False, "message": "沒有任何新客戶被新增。", "errors": errors}), 200
    response = supabase.table('customers').insert(new_customers_to_insert).execute()
    return jsonify({"success": True, "message": f"成功新增 {len(response.data)} 筆客戶。", "errors": errors}), 201

# --- 項目管理 API ---
@app.route('/items', methods=['GET'])
def get_items():
    response = supabase.table('items').select('*').order('name').execute()
    return jsonify(response.data)

@app.route('/items', methods=['POST'])
def add_item():
    data = request.get_json()
    name = data.get('name', '').strip()
    category = data.get('category', '未分類')
    if not name:
        return jsonify({"error": "項目名稱不能是空的"}), 400
    existing = supabase.table('items').select('id').eq('name', name).execute()
    if existing.data:
        return jsonify({"error": "此項目名稱已存在"}), 409
    response = supabase.table('items').insert({'name': name, 'category': category}).execute()
    return jsonify(response.data[0]), 201

@app.route('/items/batch', methods=['POST'])
def add_items_batch():
    data = request.get_json()
    items_data = data.get('items', [])
    if not items_data:
        return jsonify({"error": "沒有提供項目列表"}), 400
    new_items_to_insert = []
    errors = []
    existing_response = supabase.table('items').select('name').execute()
    existing_names = {i['name'] for i in existing_response.data}
    for item in items_data:
        name = str(item.get('name', '')).strip()
        category_val = item.get('category')
        category = ""
        if category_val == 1 or str(category_val).lower() in ['1', '總公司']:
            category = "總公司"
        elif category_val == 2 or str(category_val).lower() in ['2', '分公司']:
            category = "分公司"
        else:
            errors.append(f"項目 '{name}' 的歸屬 '{category_val}' 格式錯誤，已跳過。")
            continue
        if not name:
            errors.append(f"'{name}' 為空值，已跳過。")
        elif name in existing_names:
            errors.append(f"'{name}' 已存在，已跳過。")
        else:
            new_items_to_insert.append({'name': name, 'category': category})
            existing_names.add(name)
    if not new_items_to_insert:
        return jsonify({"success": False, "message": "沒有任何新項目被新增。", "errors": errors}), 200
    response = supabase.table('items').insert(new_items_to_insert).execute()
    return jsonify({"success": True, "message": f"成功新增 {len(response.data)} 筆項目。", "errors": errors}), 201

@app.route('/items/<int:item_id>', methods=['PUT'])
def update_item(item_id):
    data = request.get_json()
    new_data = {'name': data.get('name', '').strip(), 'category': data.get('category')}
    response = supabase.table('items').update(new_data).eq('id', item_id).execute()
    if not response.data:
        return jsonify({"error": "找不到項目"}), 404
    return jsonify(response.data[0])

@app.route('/items/<int:item_id>', methods=['DELETE'])
def delete_item(item_id):
    response = supabase.table('items').delete().eq('id', item_id).execute()
    if not response.data:
        return jsonify({"error": "找不到項目"}), 404
    return jsonify({"success": True})

# --- 報告/帳單處理 API ---

def _get_item_categories():
    """輔助函式：從資料庫獲取最新的項目分類字典"""
    items_response = supabase.table('items').select('name, category').execute()
    return {item['name']: item['category'] for item in items_response.data}

def _clean_price_for_manual_text(price_str):
    """輔助函式：專門給手動貼上功能使用，清理價格字串"""
    try:
        cleaned_str = re.sub(r'[$,]', '', price_str.strip())
        if cleaned_str == '-' or not cleaned_str:
            return 0.0
        return float(cleaned_str)
    except (ValueError, TypeError):
        return 0.0

def _calculate_report_from_text(report_text: str):
    """(供手動貼上使用) 接收報表文字，回傳計算結果字典"""
    item_categories = _get_item_categories()
    
    # 分開記錄需要計稅和不計稅的營收
    total_revenue_taxable, total_revenue_non_taxable = 0, 0
    head_office_revenue_taxable, head_office_revenue_non_taxable = 0, 0
    branch_office_revenue_taxable, branch_office_revenue_non_taxable = 0, 0
    
    unclassified_items = set()
    detailed_items = []
    
    lines = [line.strip() for line in report_text.strip().split('\n') if line.strip()]
    
    for i in range(0, len(lines), 5):
        record = lines[i:i+5]
        if len(record) == 5:
            item_name = record[0].strip()
            unit_price_str = record[1].strip()
            quantity_str = record[2].strip()
            price_line = record[3].strip()
            
            price = _clean_price_for_manual_text(price_line)
            category = item_categories.get(item_name, "未分類")
            
            # 檢查是否為不計稅項目
            is_non_taxable = "不計稅" in item_name
            
            detailed_items.append({
                "item_name": item_name, 
                "category": category, 
                "unit_price": unit_price_str, 
                "quantity": quantity_str, 
                "total_price": price,
                "is_non_taxable": is_non_taxable
            })
            
            if category != "未分類":
                # 根據是否計稅分別累加
                if is_non_taxable:
                    total_revenue_non_taxable += price
                    if category == "總公司":
                        head_office_revenue_non_taxable += price
                    else:
                        branch_office_revenue_non_taxable += price
                else:
                    total_revenue_taxable += price
                    if category == "總公司":
                        head_office_revenue_taxable += price
                    else:
                        branch_office_revenue_taxable += price
            else:
                unclassified_items.add(item_name)
    
    # 計算總營收（稅前）
    total_revenue = total_revenue_taxable + total_revenue_non_taxable
    head_office_revenue = head_office_revenue_taxable + head_office_revenue_non_taxable
    branch_office_revenue = branch_office_revenue_taxable + branch_office_revenue_non_taxable
    
    # 計算稅後營收（需計稅的乘以1.05，不計稅的保持原值）
    total_revenue_taxed = (total_revenue_taxable * 1.05) + total_revenue_non_taxable
    head_office_revenue_taxed = (head_office_revenue_taxable * 1.05) + head_office_revenue_non_taxable
    branch_office_revenue_taxed = (branch_office_revenue_taxable * 1.05) + branch_office_revenue_non_taxable
    
    return {
        'total_revenue': total_revenue,
        'head_office_revenue': head_office_revenue,
        'branch_office_revenue': branch_office_revenue,
        'total_revenue_taxed': total_revenue_taxed,
        'head_office_revenue_taxed': head_office_revenue_taxed,
        'branch_office_revenue_taxed': branch_office_revenue_taxed,
        'unclassified_items': list(unclassified_items),
        'detailed_items': detailed_items
    }

 # === 修改 app.py 中的計算函數 ===

def _calculate_report_from_scraped_data(scraped_details: list):
    """(供自動抓取使用) 直接處理爬蟲回傳的結構化資料"""
    item_categories = _get_item_categories()
    
    # 分開記錄需要計稅和不計稅的營收
    total_revenue_taxable, total_revenue_non_taxable = 0, 0
    head_office_revenue_taxable, head_office_revenue_non_taxable = 0, 0
    branch_office_revenue_taxable, branch_office_revenue_non_taxable = 0, 0
    
    unclassified_items = set()
    
    for item in scraped_details:
        item_name = item.get("item_name", "")
        price = item.get("total_price", 0.0)
        category = item_categories.get(item_name, "未分類")
        item["category"] = category
        
        # 重要：根據 tab_source 處理價格
        tab_source = item.get("tab_source", "")
        if tab_source == "其他應退款":
            # 應退款項目，確保價格為負數
            price = -abs(price)
            item["total_price"] = price  # 更新項目的價格為負數
        
        # 檢查是否為不計稅項目
        is_non_taxable = "不計稅" in item_name
        item["is_non_taxable"] = is_non_taxable
        
        if category != "未分類":
            # 根據是否計稅分別累加
            if is_non_taxable:
                total_revenue_non_taxable += price
                if category == "總公司":
                    head_office_revenue_non_taxable += price
                else:
                    branch_office_revenue_non_taxable += price
            else:
                total_revenue_taxable += price
                if category == "總公司":
                    head_office_revenue_taxable += price
                else:
                    branch_office_revenue_taxable += price
        else:
            unclassified_items.add(item_name)
    
    # 計算總營收（稅前）
    total_revenue = total_revenue_taxable + total_revenue_non_taxable
    head_office_revenue = head_office_revenue_taxable + head_office_revenue_non_taxable
    branch_office_revenue = branch_office_revenue_taxable + branch_office_revenue_non_taxable
    
    # 計算稅後營收（需計稅的乘以1.05，不計稅的保持原值）
    total_revenue_taxed = (total_revenue_taxable * 1.05) + total_revenue_non_taxable
    head_office_revenue_taxed = (head_office_revenue_taxable * 1.05) + head_office_revenue_non_taxable
    branch_office_revenue_taxed = (branch_office_revenue_taxable * 1.05) + branch_office_revenue_non_taxable
    
    return {
        'total_revenue': total_revenue,
        'head_office_revenue': head_office_revenue,
        'branch_office_revenue': branch_office_revenue,
        'total_revenue_taxed': total_revenue_taxed,
        'head_office_revenue_taxed': head_office_revenue_taxed,
        'branch_office_revenue_taxed': branch_office_revenue_taxed,
        'unclassified_items': list(unclassified_items),
        'detailed_items': scraped_details
    }

def _calculate_report_from_text(report_text: str):
    """(供手動貼上使用) 接收報表文字，回傳計算結果字典"""
    item_categories = _get_item_categories()
    
    # 分開記錄需要計稅和不計稅的營收
    total_revenue_taxable, total_revenue_non_taxable = 0, 0
    head_office_revenue_taxable, head_office_revenue_non_taxable = 0, 0
    branch_office_revenue_taxable, branch_office_revenue_non_taxable = 0, 0
    
    unclassified_items = set()
    detailed_items = []
    
    lines = [line.strip() for line in report_text.strip().split('\n') if line.strip()]
    
    for i in range(0, len(lines), 5):
        record = lines[i:i+5]
        if len(record) == 5:
            item_name = record[0].strip()
            unit_price_str = record[1].strip()
            quantity_str = record[2].strip()
            price_line = record[3].strip()
            
            price = _clean_price_for_manual_text(price_line)
            category = item_categories.get(item_name, "未分類")
            
            # 檢查是否為不計稅項目
            is_non_taxable = "不計稅" in item_name
            
            detailed_items.append({
                "item_name": item_name, 
                "category": category, 
                "unit_price": unit_price_str, 
                "quantity": quantity_str, 
                "total_price": price,
                "is_non_taxable": is_non_taxable,
                "tab_source": "款項明細"  # 手動貼上默認為款項明細
            })
            
            if category != "未分類":
                # 根據是否計稅分別累加
                if is_non_taxable:
                    total_revenue_non_taxable += price
                    if category == "總公司":
                        head_office_revenue_non_taxable += price
                    else:
                        branch_office_revenue_non_taxable += price
                else:
                    total_revenue_taxable += price
                    if category == "總公司":
                        head_office_revenue_taxable += price
                    else:
                        branch_office_revenue_taxable += price
            else:
                unclassified_items.add(item_name)
    
    # 計算總營收（稅前）
    total_revenue = total_revenue_taxable + total_revenue_non_taxable
    head_office_revenue = head_office_revenue_taxable + head_office_revenue_non_taxable
    branch_office_revenue = branch_office_revenue_taxable + branch_office_revenue_non_taxable
    
    # 計算稅後營收（需計稅的乘以1.05，不計稅的保持原值）
    total_revenue_taxed = (total_revenue_taxable * 1.05) + total_revenue_non_taxable
    head_office_revenue_taxed = (head_office_revenue_taxable * 1.05) + head_office_revenue_non_taxable
    branch_office_revenue_taxed = (branch_office_revenue_taxable * 1.05) + branch_office_revenue_non_taxable
    
    return {
        'total_revenue': total_revenue,
        'head_office_revenue': head_office_revenue,
        'branch_office_revenue': branch_office_revenue,
        'total_revenue_taxed': total_revenue_taxed,
        'head_office_revenue_taxed': head_office_revenue_taxed,
        'branch_office_revenue_taxed': branch_office_revenue_taxed,
        'unclassified_items': list(unclassified_items),
        'detailed_items': detailed_items
    }


@app.route('/process_report', methods=['POST'])
def process_report():
    data = request.get_json()
    text = data.get('text', '')
    result = _calculate_report_from_text(text)
    return jsonify(result)

@app.route('/scrape_and_process_report', methods=['POST'])
def scrape_and_process_report():
    try:
        data = request.get_json()
        customer_id = data.get('customer_id')
        year = data.get('year')
        month = data.get('month')

        if not all([customer_id, year, month]):
            return jsonify({"error": "缺少客戶ID、年份或月份"}), 400

        customer_res = supabase.table('customers').select('name').eq('id', customer_id).single().execute()
        customer_name = customer_res.data['name']

        scrape_result = scrape_monthly_bill(int(year), int(month), customer_name)
        
        # 處理新的返回格式
        if isinstance(scrape_result, dict) and 'details' in scrape_result:
            scraped_details = scrape_result['details']
            expected_count = scrape_result.get('expected_count', 0)
            actual_count = scrape_result.get('actual_count', 0)
            completion_rate = scrape_result.get('completion_rate', 0)
            tab_statistics = scrape_result.get('tab_statistics')
            tab_breakdown = scrape_result.get('tab_breakdown')
            failed_tabs = scrape_result.get('failed_tabs')
        else:
            # 向後兼容舊格式
            scraped_details = scrape_result
            expected_count = 0
            actual_count = len(scraped_details)
            completion_rate = 100
            tab_statistics = None
            tab_breakdown = None
            failed_tabs = None
        
        if not scraped_details:
            return jsonify({"error": "爬取成功，但未找到任何帳單明細。請確認該月份有資料。"}), 404

        # 計算報表（包含不計稅處理）
        result = _calculate_report_from_scraped_data(scraped_details)
        
        report_text = ""
        for item in scraped_details:
            report_text += f"{item.get('item_name', '')}\n"
            report_text += f"{item.get('unit_price', '')}\n"
            report_text += f"{item.get('quantity', '')}\n"
            report_text += f"${item.get('total_price', 0):,}\n"
            report_text += f"{item.get('remark', '')}\n"
        
        result['report_text'] = report_text.strip()
        
        # 添加完整性統計資訊
        result['expected_count'] = expected_count if expected_count else None
        result['actual_count'] = actual_count
        result['completion_rate'] = completion_rate
        
        # 添加Tab統計資訊（如果有）
        if tab_statistics:
            result['tab_statistics'] = tab_statistics
        if tab_breakdown:
            result['tab_breakdown'] = tab_breakdown
        if failed_tabs:
            result['failed_tabs'] = failed_tabs
        
        # 處理不同情況的提示
        if expected_count is None or expected_count <= 0:
            result['warning'] = f"無法獲取預期筆數，實際抓取到 {actual_count} 筆資料。請手動確認是否完整。"
        elif actual_count != expected_count:
            if actual_count > expected_count:
                result['warning'] = f"⚠️ 注意：抓取筆數({actual_count})超過預期筆數({expected_count})，可能有重複資料！請檢查明細。"
            else:
                result['warning'] = f"⚠️ 注意：抓取筆數({actual_count})少於預期筆數({expected_count})，可能有遺漏！完成率 {completion_rate:.1f}%"
        else:
            result['success_message'] = f"✔ 抓取成功：{actual_count}/{expected_count} 筆 (100%)"

        return jsonify(result)

    except Exception as e:
        print(f"執行 /scrape_and_process_report 時發生嚴重錯誤: {e}")
        traceback.print_exc()
        return jsonify({"error": f"伺服器內部發生未預期的錯誤: {str(e)}"}), 500

# 修改 app.py 中的 save_report 函數
@app.route('/save_report', methods=['POST'])
def save_report():
    data = request.get_json()
    customer_id = data.get('customer_id')
    year = data.get('year')
    month = data.get('month')
    report_summary = {
        'customer_id': customer_id, 'year': year, 'month': month,
        'total_revenue': data.get('total_revenue'), 
        'head_office_revenue': data.get('head_office_revenue'), 
        'branch_office_revenue': data.get('branch_office_revenue'),
        'total_revenue_taxed': data.get('total_revenue_taxed'), 
        'head_office_revenue_taxed': data.get('head_office_revenue_taxed'), 
        'branch_office_revenue_taxed': data.get('branch_office_revenue_taxed')
    }
    if not all(v is not None for v in report_summary.values()):
        return jsonify({"error": "傳送的總覽資料不完整"}), 400
    try:
        existing_report_response = supabase.table('reports').select('id').eq('customer_id', customer_id).eq('year', year).eq('month', month).execute()
        if existing_report_response.data:
            print(f"找到客戶 {customer_id} 在 {year}-{month} 的舊報告，準備刪除...")
            for old_report in existing_report_response.data:
                old_report_id = old_report['id']
                supabase.table('report_items').delete().eq('report_id', old_report_id).execute()
                supabase.table('reports').delete().eq('id', old_report_id).execute()
            print(f"舊報告 {old_report_id} 已刪除。")
        
        summary_response = supabase.table('reports').insert(report_summary).execute()
        new_report_id = summary_response.data[0]['id']
        detailed_items_to_insert = []
        source_detailed_items = data.get('detailed_items', [])
        for item in source_detailed_items:
            if all(k in item for k in ['item_name', 'category', 'unit_price', 'quantity', 'total_price']):
                detailed_items_to_insert.append({
                    'report_id': new_report_id, 
                    'item_name': item['item_name'], 
                    'category': item['category'], 
                    'unit_price': str(item['unit_price']),
                    'quantity': str(item['quantity']),
                    'total_price': item['total_price'],
                    'tab_source': item.get('tab_source', '款項明細')  # 新增：保存 tab_source
                })
        if detailed_items_to_insert:
            supabase.table('report_items').insert(detailed_items_to_insert).execute()
        return jsonify({"success": True, "message": "報告與明細已儲存"}), 201
    except Exception as e:
        print(f"儲存報告時發生錯誤: {e}")
        return jsonify({"error": str(e)}), 500

# 修改 get_report_details 函數
@app.route('/reports/<int:report_id>/details', methods=['GET'])
def get_report_details(report_id):
    try:
        # 確保查詢包含 tab_source 欄位
        response = supabase.table('report_items').select('*').eq('report_id', report_id).execute()
        if hasattr(response, 'data'):
            return jsonify(response.data)
        else:
            return jsonify(response[0])
    except Exception as e:
        print(f"查詢 report_id={report_id} 的明細時發生錯誤: {e}")
        return jsonify({"error": str(e)}), 500
    data = request.get_json()
    customer_id = data.get('customer_id')
    year = data.get('year')
    month = data.get('month')
    report_summary = {
        'customer_id': customer_id, 'year': year, 'month': month,
        'total_revenue': data.get('total_revenue'), 
        'head_office_revenue': data.get('head_office_revenue'), 
        'branch_office_revenue': data.get('branch_office_revenue'),
        'total_revenue_taxed': data.get('total_revenue_taxed'), 
        'head_office_revenue_taxed': data.get('head_office_revenue_taxed'), 
        'branch_office_revenue_taxed': data.get('branch_office_revenue_taxed')
    }
    if not all(v is not None for v in report_summary.values()):
        return jsonify({"error": "傳送的總覽資料不完整"}), 400
    try:
        existing_report_response = supabase.table('reports').select('id').eq('customer_id', customer_id).eq('year', year).eq('month', month).execute()
        if existing_report_response.data:
            print(f"找到客戶 {customer_id} 在 {year}-{month} 的舊報告，準備刪除...")
            for old_report in existing_report_response.data:
                old_report_id = old_report['id']
                supabase.table('report_items').delete().eq('report_id', old_report_id).execute()
                supabase.table('reports').delete().eq('id', old_report_id).execute()
            print(f"舊報告 {old_report_id} 已刪除。")
        
        summary_response = supabase.table('reports').insert(report_summary).execute()
        new_report_id = summary_response.data[0]['id']
        detailed_items_to_insert = []
        source_detailed_items = data.get('detailed_items', [])
        for item in source_detailed_items:
            if all(k in item for k in ['item_name', 'category', 'unit_price', 'quantity', 'total_price']):
                detailed_items_to_insert.append({
                    'report_id': new_report_id, 
                    'item_name': item['item_name'], 
                    'category': item['category'], 
                    'unit_price': str(item['unit_price']),
                    'quantity': str(item['quantity']),
                    'total_price': item['total_price']
                })
        if detailed_items_to_insert:
            supabase.table('report_items').insert(detailed_items_to_insert).execute()
        return jsonify({"success": True, "message": "報告與明細已儲存"}), 201
    except Exception as e:
        print(f"儲存報告時發生錯誤: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/all_reports', methods=['GET'])
def get_all_reports():
    try:
        query = supabase.table('reports').select('*, customers(name)')
        year = request.args.get('year')
        month = request.args.get('month')
        search_term = request.args.get('search')
        if year and year != 'all': query = query.eq('year', int(year))
        if month and month != 'all': query = query.eq('month', int(month))
        if search_term: query = query.ilike('customers.name', f'%{search_term}%')
        response = query.order('id', desc=True).execute()
        return jsonify(response.data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    try:
        response = supabase.table('report_items').select('*').eq('report_id', report_id).execute()
        if hasattr(response, 'data'):
            return jsonify(response.data)
        else:
            return jsonify(response[0]) 
    except Exception as e:
        print(f"查詢 report_id={report_id} 的明細時發生錯誤: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/reports/<int:report_id>', methods=['DELETE'])
def delete_report(report_id):
    try:
        supabase.table('report_items').delete().eq('report_id', report_id).execute()
        response = supabase.table('reports').delete().eq('id', report_id).execute()
        if not response.data:
            return jsonify({"error": "找不到該筆帳單"}), 404
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/reconciliation_status', methods=['GET'])
def get_reconciliation_status():
    year_str = request.args.get('year')
    month_str = request.args.get('month')
    if not year_str or not month_str:
        return jsonify({"error": "未提供年份或月份"}), 400
    try:
        year = int(year_str)
        month = int(month_str)
        active_customers_res = supabase.table('customers').select('id, name').eq('is_active', True).execute()
        active_customers = active_customers_res.data
        reports_res = supabase.table('reports').select('customer_id').eq('year', year).eq('month', month).execute()
        reconciled_customer_ids = {rep['customer_id'] for rep in reports_res.data}
        status_list = []
        for cust in active_customers:
            status = "reconciled" if cust['id'] in reconciled_customer_ids else "pending"
            status_list.append({"id": cust['id'], "name": cust['name'], "status": status})
        all_reconciled = len(reconciled_customer_ids) >= len(active_customers) and len(active_customers) > 0
        return jsonify({"status_list": status_list, "all_reconciled": all_reconciled})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/check_summary_exists', methods=['GET'])
def check_summary_exists():
    year = request.args.get('year')
    month = request.args.get('month')
    if not year or not month:
        return jsonify({"error": "未提供年份或月份"}), 400
    try:
        response = supabase.table('monthly_summaries').select('id', count='exact').eq('year', int(year)).eq('month', int(month)).execute()
        exists = response.count > 0
        return jsonify({"exists": exists})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/save_monthly_summary', methods=['POST'])
def save_monthly_summary():
    data = request.get_json()
    year = data.get('year')
    month = data.get('month')
    if not year or not month:
        return jsonify({"error": "未提供年份或月份"}), 400
    try:
        reports_res = supabase.table('reports').select('*').eq('year', year).eq('month', month).execute()
        if not reports_res.data:
            return jsonify({"error": "該月份沒有任何已入帳的資料可供匯總"}), 404
        
        summary_data = {
            'year': int(year), 'month': int(month),
            'total_revenue_sum': sum(r.get('total_revenue', 0) for r in reports_res.data),
            'head_office_revenue_sum': sum(r.get('head_office_revenue', 0) for r in reports_res.data),
            'branch_office_revenue_sum': sum(r.get('branch_office_revenue', 0) for r in reports_res.data),
            'total_revenue_taxed_sum': sum(r.get('total_revenue_taxed', 0) for r in reports_res.data),
            'head_office_revenue_taxed_sum': sum(r.get('head_office_revenue_taxed', 0) for r in reports_res.data),
            'branch_office_revenue_taxed_sum': sum(r.get('branch_office_revenue_taxed', 0) for r in reports_res.data)
        }
        supabase.table('monthly_summaries').upsert(summary_data, on_conflict='year,month').execute()
        return jsonify({"success": True, "message": "總表已成功存入紀錄"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/download_monthly_summary', methods=['GET'])
def download_monthly_summary():
    year = request.args.get('year')
    month = request.args.get('month')
    if not year or not month:
        return jsonify({"error": "未提供年份或月份"}), 400
    try:
        summary_res = supabase.table('monthly_summaries').select('*').eq('year', year).eq('month', month).execute()
        if not summary_res.data:
            return jsonify({"error": "找不到該月份的總表紀錄，請先存入紀錄"}), 404
        
        summary_data = summary_res.data[0]
        
        df_data = {
            '項目': [
                '總營收', '總公司營收', '分公司營收',
                '稅後總營收', '稅後總公司營收', '稅後分公司營收'
            ],
            '金額': [
                summary_data.get('total_revenue_sum', 0),
                summary_data.get('head_office_revenue_sum', 0),
                summary_data.get('branch_office_revenue_sum', 0),
                summary_data.get('total_revenue_taxed_sum', 0),
                summary_data.get('head_office_revenue_taxed_sum', 0),
                summary_data.get('branch_office_revenue_taxed_sum', 0)
            ]
        }
        df = pd.DataFrame(df_data)
        
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name=f'{year}年{month}月總表')
            worksheet = writer.sheets[f'{year}年{month}月總表']
            worksheet.column_dimensions['A'].width = 30
            worksheet.column_dimensions['B'].width = 15
        output.seek(0)
        return send_file(output, mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', as_attachment=True, download_name=f'{year}_{month}_monthly_summary.xlsx')
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/historical_summaries', methods=['GET'])
def get_historical_summaries():
    try:
        response = supabase.table('monthly_summaries').select('*').order('year', desc=True).order('month', desc=True).execute()
        return jsonify(response.data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/monthly_summary', methods=['DELETE'])
def delete_monthly_summary():
    data = request.get_json()
    year = data.get('year')
    month = data.get('month')
    if not year or not month:
        return jsonify({"error": "未提供年份或月份"}), 400
    try:
        response = supabase.table('monthly_summaries').delete().eq('year', int(year)).eq('month', int(month)).execute()
        return jsonify({"success": True, "message": "總表紀錄已刪除"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/')
def serve_index():
    return app.send_static_file('index.html')

if __name__ == '__main__':
    app.run(debug=True)