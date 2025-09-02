import re
from playwright.sync_api import sync_playwright, TimeoutError

def clean_text(text):
    """輔助函式：清理字串，移除特殊字元和多餘空格"""
    if text is None:
        return ""
    return text.strip()

def clean_price(price_str):
    """輔助函式：清理價格字串，移除 '$' 和 ','，並處理無效字元"""
    if price_str is None:
        return 0.0
    try:
        cleaned_str = re.sub(r'[$,]', '', price_str.strip())
        if cleaned_str == '-' or not cleaned_str:
            return 0.0
        return float(cleaned_str)
    except (ValueError, TypeError):
        print(f"警告：價格轉換失敗，原始值為 '{price_str}'，已視為 0。")
        return 0.0

def scrape_tab_data(page, tab_name, expected_count=0):
    """爬取單個tab的資料 - 改進滾動策略確保抓取所有資料"""
    print(f"\n開始爬取【{tab_name}】的資料...")
    
    # 重新找到當前Tab的viewport
    try:
        # 等待資料穩定載入
        page.wait_for_timeout(3000)
        
        # 嘗試找到當前顯示的viewport
        viewport = page.locator("div.ag-body-viewport").last
        viewport.wait_for(state="visible", timeout=5000)
    except:
        print(f"警告：無法定位【{tab_name}】的viewport")
        return []
    
    # 初始化變數
    all_bill_details = []
    group_header_count = 0
    seen_exact_items = set()  # 記錄已見過的完全相同項目
    
    # 先獲取viewport的高度
    try:
        viewport_height = viewport.evaluate("el => el.clientHeight")
        print(f"Viewport 高度: {viewport_height}px")
    except:
        viewport_height = 600  # 預設值
    
    # 滾動到最頂部開始
    try:
        viewport.evaluate("el => el.scrollTop = 0")
        page.wait_for_timeout(2000)
    except:
        print(f"警告：無法滾動【{tab_name}】的viewport")
    
    # 使用更細緻的滾動策略
    # 每次滾動較小的距離（50px），確保不會跳過任何資料
    scroll_step = 50  # 每次滾動50像素
    max_scroll_position = 10000  # 最大滾動位置
    current_scroll = 0
    
    # 記錄連續沒有新資料的次數
    no_new_data_count = 0
    last_count = 0
    
    print(f"開始細緻滾動，步長: {scroll_step}px")
    
    while current_scroll < max_scroll_position:
        try:
            # 獲取當前可見的所有行
            visible_rows = page.locator("div.ag-row-level-1").all()
            
            for row in visible_rows:
                try:
                    # 提取所有欄位資料
                    cell_locators = row.locator('span.ag-cell-value')
                    cell_count = cell_locators.count()
                    
                    if cell_count >= 6:  # 確保有足夠的欄位
                        # 獲取所有六個欄位的值
                        col0 = cell_locators.nth(0).text_content(timeout=500)  # 站所
                        col1 = cell_locators.nth(1).text_content(timeout=500)  # 項目
                        col2 = cell_locators.nth(2).text_content(timeout=500)  # 單價
                        col3 = cell_locators.nth(3).text_content(timeout=500)  # 數量
                        col4 = cell_locators.nth(4).text_content(timeout=500)  # 總價
                        col5 = cell_locators.nth(5).text_content(timeout=500) if cell_count > 5 else ""  # 備註
                        
                        # 檢查是否為群組標題行
                        if col1.strip() == "-":
                            if "(" in col0 and ")" in col0:
                                if group_header_count == 0:
                                    print(f"  -> 跳過群組標題行：{col0.strip()}")
                                group_header_count += 1
                            continue
                        
                        # 檢查是否為有效資料
                        if not col1.strip() or col1.strip() == "":
                            continue
                        
                        # 建立完整的項目識別碼（包含所有欄位）
                        item_signature = f"{col0.strip()}|{col1.strip()}|{col2.strip()}|{col3.strip()}|{col4.strip()}|{col5.strip()}"
                        
                        # 檢查是否已經處理過這個項目
                        if item_signature in seen_exact_items:
                            continue
                        
                        # 記錄這個項目
                        seen_exact_items.add(item_signature)
                        
                        detail = {
                            "tab_source": tab_name,
                            "station": clean_text(col0),
                            "item_name": clean_text(col1),
                            "unit_price": clean_text(col2),
                            "quantity": clean_text(col3),
                            "total_price": clean_price(col4),
                            "remark": clean_text(col5),
                        }
                        
                        all_bill_details.append(detail)
                        
                        # 詳細輸出每筆抓到的資料
                        print(f"  -> 第 {len(all_bill_details)} 筆: {col1.strip()[:30]} | 單價:{col2} | 數量:{col3} | 總價:{col4}")
                        
                except Exception as e:
                    continue
            
            # 檢查是否有新資料
            current_count = len(all_bill_details)
            if current_count == last_count:
                no_new_data_count += 1
                # 如果連續多次沒有新資料，檢查是否已到底部
                if no_new_data_count >= 20:  # 連續20次沒新資料（約1000px）
                    # 嘗試滾動到最底部確認
                    try:
                        scroll_height = viewport.evaluate("el => el.scrollHeight")
                        current_pos = viewport.evaluate("el => el.scrollTop")
                        if current_pos >= scroll_height - viewport_height - 100:
                            print(f"已到達底部，共抓取 {len(all_bill_details)} 筆")
                            break
                    except:
                        pass
            else:
                no_new_data_count = 0
                last_count = current_count
            
            # 滾動到下一個位置
            current_scroll += scroll_step
            viewport.evaluate(f"el => el.scrollTop = {current_scroll}")
            page.wait_for_timeout(200)  # 等待資料載入
            
            # 每10次滾動輸出進度
            if current_scroll % 500 == 0:
                print(f"  滾動進度: {current_scroll}px, 已抓取 {len(all_bill_details)} 筆")
                
        except Exception as e:
            print(f"滾動位置 {current_scroll} 時發生錯誤: {e}")
            current_scroll += scroll_step
            continue
    
    # 最後再次滾動到底部，確保沒有遺漏
    print("執行最終檢查...")
    try:
        # 滾動到最底部
        viewport.evaluate("el => el.scrollTop = el.scrollHeight")
        page.wait_for_timeout(2000)
        
        # 再往上滾動一點然後往下，觸發虛擬滾動載入
        viewport.evaluate("el => el.scrollTop = el.scrollHeight - 500")
        page.wait_for_timeout(1000)
        viewport.evaluate("el => el.scrollTop = el.scrollHeight")
        page.wait_for_timeout(2000)
        
        # 最終檢查所有可見行
        final_rows = page.locator("div.ag-row-level-1").all()
        final_new_count = 0
        
        for row in final_rows:
            try:
                cell_locators = row.locator('span.ag-cell-value')
                if cell_locators.count() >= 6:
                    col0 = cell_locators.nth(0).text_content(timeout=500)
                    col1 = cell_locators.nth(1).text_content(timeout=500)
                    col2 = cell_locators.nth(2).text_content(timeout=500)
                    col3 = cell_locators.nth(3).text_content(timeout=500)
                    col4 = cell_locators.nth(4).text_content(timeout=500)
                    col5 = cell_locators.nth(5).text_content(timeout=500) if cell_locators.count() > 5 else ""
                    
                    if col1.strip() != "-" and col1.strip() != "":
                        item_signature = f"{col0.strip()}|{col1.strip()}|{col2.strip()}|{col3.strip()}|{col4.strip()}|{col5.strip()}"
                        
                        if item_signature not in seen_exact_items:
                            seen_exact_items.add(item_signature)
                            
                            detail = {
                                "tab_source": tab_name,
                                "station": clean_text(col0),
                                "item_name": clean_text(col1),
                                "unit_price": clean_text(col2),
                                "quantity": clean_text(col3),
                                "total_price": clean_price(col4),
                                "remark": clean_text(col5),
                            }
                            all_bill_details.append(detail)
                            final_new_count += 1
                            print(f"  -> 最終補充第 {len(all_bill_details)} 筆: {col1.strip()[:30]} | 單價:{col2} | 數量:{col3} | 總價:{col4}")
            except:
                continue
        
        if final_new_count > 0:
            print(f"最終檢查新增了 {final_new_count} 筆資料")
            
    except Exception as e:
        print(f"最終檢查時發生錯誤: {e}")
    
    print(f"【{tab_name}】爬取完成，共 {len(all_bill_details)} 筆")
    
    # 詳細顯示所有抓到的資料
    if all_bill_details:
        print(f"\n【{tab_name}】明細清單：")
        for i, item in enumerate(all_bill_details, 1):
            print(f"  {i}. {item['item_name']} | 單價:{item['unit_price']} | 數量:{item['quantity']} | 總價:{item['total_price']}")
    
    # 如果預期筆數和實際筆數不符，顯示警告
    if expected_count > 0 and len(all_bill_details) != expected_count:
        print(f"⚠️ 警告：預期 {expected_count} 筆，實際抓取 {len(all_bill_details)} 筆")
    
    return all_bill_details
    """爬取單個tab的資料 - 避免完全重複但保留業務上的重複項目"""
    print(f"\n開始爬取【{tab_name}】的資料...")
    
    # 重新找到當前Tab的viewport
    try:
        # 等待資料穩定載入
        page.wait_for_timeout(3000)
        
        # 嘗試找到當前顯示的viewport
        viewport = page.locator("div.ag-body-viewport").last
        viewport.wait_for(state="visible", timeout=5000)
    except:
        print(f"警告：無法定位【{tab_name}】的viewport")
        return []
    
    # 初始化變數
    all_bill_details = []
    group_header_count = 0
    processed_row_indices = set()  # 記錄已處理的row index
    seen_exact_items = set()  # 記錄已見過的完全相同項目（用於去除爬蟲重複）
    
    # 滾動到最頂部開始
    try:
        viewport.evaluate("el => el.scrollTop = 0")
        page.wait_for_timeout(2000)
    except:
        print(f"警告：無法滾動【{tab_name}】的viewport")
    
    # 計算需要滾動的次數
    scroll_iterations = max(30, (expected_count // 2) + 20) if expected_count > 0 else 60
    print(f"將進行 {scroll_iterations} 次滾動迭代")
    
    last_count = 0
    no_new_data_count = 0
    
    # 逐步滾動並收集資料
    for scroll_count in range(scroll_iterations):
        try:
            visible_rows = page.locator("div.ag-row-level-1").all()
            
            for row in visible_rows:
                try:
                    row_index = row.get_attribute("row-index")
                    
                    # 避免重複處理同一行
                    if row_index in processed_row_indices:
                        continue
                    
                    # 提取資料
                    cell_locators = row.locator('span.ag-cell-value')
                    cell_count = cell_locators.count()
                    
                    if cell_count >= 6:  # 確保有足夠的欄位
                        # 獲取所有六個欄位的值
                        col0 = cell_locators.nth(0).text_content(timeout=1000)  # 站所
                        col1 = cell_locators.nth(1).text_content(timeout=1000)  # 項目
                        col2 = cell_locators.nth(2).text_content(timeout=1000)  # 單價
                        col3 = cell_locators.nth(3).text_content(timeout=1000)  # 數量
                        col4 = cell_locators.nth(4).text_content(timeout=1000)  # 總價
                        col5 = cell_locators.nth(5).text_content(timeout=1000) if cell_count > 5 else ""  # 備註
                        
                        # 檢查是否為群組標題行
                        if col1.strip() == "-":
                            if "(" in col0 and ")" in col0:
                                if group_header_count == 0:
                                    print(f"  -> 跳過群組標題行：{col0.strip()}")
                                group_header_count += 1
                            continue
                        
                        # 檢查是否為有效資料
                        if not col1.strip() or col1.strip() == "":
                            continue
                        
                        # 建立完整的項目識別碼（包含所有欄位）
                        item_signature = f"{col0}|{col1}|{col2}|{col3}|{col4}|{col5}"
                        
                        # 檢查是否為完全相同的項目（爬蟲重複）
                        if item_signature in seen_exact_items:
                            print(f"  跳過完全重複的項目: {col1.strip()[:30]} (爬蟲重複)")
                            continue
                        
                        # 記錄已處理
                        processed_row_indices.add(row_index)
                        seen_exact_items.add(item_signature)
                        
                        detail = {
                            "tab_source": tab_name,  # 標記資料來源
                            "station": clean_text(col0),
                            "item_name": clean_text(col1),
                            "unit_price": clean_text(col2),
                            "quantity": clean_text(col3),
                            "total_price": clean_price(col4),
                            "remark": clean_text(col5),
                        }
                        
                        all_bill_details.append(detail)
                        
                        # 進度提示
                        if len(all_bill_details) == 1:
                            print(f"  -> ✓ 第一筆資料: {col1.strip()}")
                        elif len(all_bill_details) % 10 == 0:
                            print(f"  -> 已抓取 {len(all_bill_details)} 筆")
                            
                except Exception as e:
                    if scroll_count == 0:
                        print(f"處理row時發生錯誤: {e}")
                    continue
            
            # 檢查是否有新資料
            current_count = len(all_bill_details)
            if current_count == last_count:
                no_new_data_count += 1
                if no_new_data_count >= 5:
                    print("連續5次滾動沒有新資料，可能已到底部")
                    break
            else:
                no_new_data_count = 0
                last_count = current_count
            
            # 滾動到下一個位置
            scroll_position = (scroll_count + 1) * 100
            viewport.evaluate(f"el => el.scrollTop = {scroll_position}")
            page.wait_for_timeout(500)
                
        except Exception as e:
            print(f"滾動迭代 {scroll_count} 時發生錯誤: {e}")
            continue
    
    # 最後再滾動到底部確保沒有遺漏
    try:
        viewport.evaluate("el => el.scrollTop = el.scrollHeight")
        page.wait_for_timeout(3000)
        
        # 最終檢查所有行
        final_rows = page.locator("div.ag-row-level-1").all()
        for row in final_rows:
            try:
                row_index = row.get_attribute("row-index")
                
                if row_index in processed_row_indices:
                    continue
                    
                cell_locators = row.locator('span.ag-cell-value')
                if cell_locators.count() >= 6:
                    col0 = cell_locators.nth(0).text_content(timeout=500)
                    col1 = cell_locators.nth(1).text_content(timeout=500)
                    col2 = cell_locators.nth(2).text_content(timeout=500)
                    col3 = cell_locators.nth(3).text_content(timeout=500)
                    col4 = cell_locators.nth(4).text_content(timeout=500)
                    col5 = cell_locators.nth(5).text_content(timeout=500) if cell_locators.count() > 5 else ""
                    
                    if col1.strip() != "-" and col1.strip() != "":
                        # 建立完整的項目識別碼
                        item_signature = f"{col0}|{col1}|{col2}|{col3}|{col4}|{col5}"
                        
                        # 檢查是否為完全相同的項目
                        if item_signature not in seen_exact_items:
                            processed_row_indices.add(row_index)
                            seen_exact_items.add(item_signature)
                            
                            detail = {
                                "tab_source": tab_name,
                                "station": clean_text(col0),
                                "item_name": clean_text(col1),
                                "unit_price": clean_text(col2),
                                "quantity": clean_text(col3),
                                "total_price": clean_price(col4),
                                "remark": clean_text(col5),
                            }
                            all_bill_details.append(detail)
                            print(f"最終補充第 {len(all_bill_details)} 筆: {col1.strip()[:30]}")
            except:
                continue
    except Exception as e:
        print(f"最終檢查時發生錯誤: {e}")
    
    print(f"【{tab_name}】爬取完成，共 {len(all_bill_details)} 筆")
    
    # 統計項目名稱重複情況（但金額不同）
    item_stats = {}
    for item in all_bill_details:
        key = item['item_name']
        if key not in item_stats:
            item_stats[key] = []
        item_stats[key].append({
            'price': item['total_price'],
            'unit_price': item['unit_price'],
            'quantity': item['quantity']
        })
    
    # 顯示業務上的重複項目（名稱相同但其他欄位不同）
    business_duplicates = []
    for name, items in item_stats.items():
        if len(items) > 1:
            # 檢查是否為業務重複（至少有一個欄位不同）
            unique_items = []
            for item in items:
                is_unique = True
                for existing in unique_items:
                    if (item['price'] == existing['price'] and 
                        item['unit_price'] == existing['unit_price'] and 
                        item['quantity'] == existing['quantity']):
                        is_unique = False
                        break
                if is_unique:
                    unique_items.append(item)
            
            if len(unique_items) > 1:
                business_duplicates.append((name, unique_items))
    
    if business_duplicates:
        print(f"  發現 {len(business_duplicates)} 個業務重複項目（名稱相同但內容不同）：")
        for name, items in business_duplicates[:3]:  # 只顯示前3個
            print(f"    - {name}: {len(items)} 個不同版本")
            for i, item in enumerate(items[:2], 1):  # 顯示前2個版本
                print(f"      版本{i}: 單價={item['unit_price']}, 數量={item['quantity']}, 總價={item['price']}")
    
    return all_bill_details
    """爬取單個tab的資料 - 完全不去重版本"""
    print(f"\n開始爬取【{tab_name}】的資料...")
    
    # 重新找到當前Tab的viewport
    try:
        # 等待資料穩定載入
        page.wait_for_timeout(3000)
        
        # 嘗試找到當前顯示的viewport
        viewport = page.locator("div.ag-body-viewport").last
        viewport.wait_for(state="visible", timeout=5000)
    except:
        print(f"警告：無法定位【{tab_name}】的viewport")
        return []
    
    # 初始化變數
    all_bill_details = []
    group_header_count = 0
    processed_row_indices = set()  # 記錄已處理的row index
    
    # 滾動到最頂部開始
    try:
        viewport.evaluate("el => el.scrollTop = 0")
        page.wait_for_timeout(2000)
    except:
        print(f"警告：無法滾動【{tab_name}】的viewport")
    
    # 計算需要滾動的次數 - 增加滾動次數確保完整性
    scroll_iterations = max(50, (expected_count // 2) + 30) if expected_count > 0 else 80
    print(f"將進行 {scroll_iterations} 次滾動迭代")
    
    last_count = 0
    no_new_data_count = 0
    
    # 逐步滾動並收集資料
    for scroll_count in range(scroll_iterations):
        try:
            visible_rows = page.locator("div.ag-row-level-1").all()
            
            for row in visible_rows:
                try:
                    row_index = row.get_attribute("row-index")
                    
                    # 避免重複處理同一行（基於row-index）
                    if row_index in processed_row_indices:
                        continue
                    
                    # 提取資料
                    cell_locators = row.locator('span.ag-cell-value')
                    cell_count = cell_locators.count()
                    
                    if cell_count >= 6:  # 確保有足夠的欄位
                        # 獲取所有六個欄位的值
                        col0 = cell_locators.nth(0).text_content(timeout=1000)  # 站所
                        col1 = cell_locators.nth(1).text_content(timeout=1000)  # 項目
                        col2 = cell_locators.nth(2).text_content(timeout=1000)  # 單價
                        col3 = cell_locators.nth(3).text_content(timeout=1000)  # 數量
                        col4 = cell_locators.nth(4).text_content(timeout=1000)  # 總價
                        col5 = cell_locators.nth(5).text_content(timeout=1000) if cell_count > 5 else ""  # 備註
                        
                        # 檢查是否為群組標題行
                        if col1.strip() == "-":
                            if "(" in col0 and ")" in col0:
                                if group_header_count == 0:
                                    print(f"  -> 跳過群組標題行：{col0.strip()}")
                                group_header_count += 1
                            continue
                        
                        # 檢查是否為有效資料
                        if not col1.strip() or col1.strip() == "":
                            continue
                        
                        # 記錄這個row已處理
                        processed_row_indices.add(row_index)
                        
                        detail = {
                            "tab_source": tab_name,  # 重要：標記資料來源
                            "station": clean_text(col0),
                            "item_name": clean_text(col1),
                            "unit_price": clean_text(col2),
                            "quantity": clean_text(col3),
                            "total_price": clean_price(col4),
                            "remark": clean_text(col5),
                        }
                        
                        all_bill_details.append(detail)
                        
                        # 進度提示
                        if len(all_bill_details) == 1:
                            print(f"  -> ✓ 第一筆資料: {col1.strip()}")
                        elif len(all_bill_details) % 10 == 0:
                            print(f"  -> 已抓取 {len(all_bill_details)} 筆")
                            
                except Exception as e:
                    if scroll_count == 0:
                        print(f"處理row {row_index if 'row_index' in locals() else 'unknown'}時發生錯誤: {e}")
                    continue
            
            # 檢查是否有新資料
            current_count = len(all_bill_details)
            if current_count == last_count:
                no_new_data_count += 1
                if no_new_data_count >= 5:
                    print("連續5次滾動沒有新資料，可能已到底部")
                    break
            else:
                no_new_data_count = 0
                last_count = current_count
            
            # 滾動到下一個位置 - 使用較小的步長確保不遺漏
            scroll_position = (scroll_count + 1) * 80  # 減小滾動步長
            viewport.evaluate(f"el => el.scrollTop = {scroll_position}")
            page.wait_for_timeout(500)  # 等待資料載入
                
        except Exception as e:
            print(f"滾動迭代 {scroll_count} 時發生錯誤: {e}")
            continue
    
    # 最後再滾動到底部確保沒有遺漏
    try:
        viewport.evaluate("el => el.scrollTop = el.scrollHeight")
        page.wait_for_timeout(3000)
        
        # 最終檢查所有行
        final_rows = page.locator("div.ag-row-level-1").all()
        for row in final_rows:
            try:
                row_index = row.get_attribute("row-index")
                
                if row_index in processed_row_indices:
                    continue
                    
                cell_locators = row.locator('span.ag-cell-value')
                if cell_locators.count() >= 6:
                    col0 = cell_locators.nth(0).text_content(timeout=500)
                    col1 = cell_locators.nth(1).text_content(timeout=500)
                    col2 = cell_locators.nth(2).text_content(timeout=500)
                    col3 = cell_locators.nth(3).text_content(timeout=500)
                    col4 = cell_locators.nth(4).text_content(timeout=500)
                    col5 = cell_locators.nth(5).text_content(timeout=500) if cell_locators.count() > 5 else ""
                    
                    if col1.strip() != "-" and col1.strip() != "":
                        processed_row_indices.add(row_index)
                        
                        detail = {
                            "tab_source": tab_name,
                            "station": clean_text(col0),
                            "item_name": clean_text(col1),
                            "unit_price": clean_text(col2),
                            "quantity": clean_text(col3),
                            "total_price": clean_price(col4),
                            "remark": clean_text(col5),
                        }
                        all_bill_details.append(detail)
                        print(f"最終補充第 {len(all_bill_details)} 筆: {col1.strip()[:30]}")
            except:
                continue
    except Exception as e:
        print(f"最終檢查時發生錯誤: {e}")
    
    print(f"【{tab_name}】爬取完成，共 {len(all_bill_details)} 筆")
    
    # 統計重複項目
    item_stats = {}
    for item in all_bill_details:
        key = item['item_name']
        if key not in item_stats:
            item_stats[key] = []
        item_stats[key].append(item['total_price'])
    
    # 顯示有重複的項目
    duplicates = [(name, prices) for name, prices in item_stats.items() if len(prices) > 1]
    if duplicates:
        print(f"  發現 {len(duplicates)} 個重複項目名稱（已全部保留）：")
        for name, prices in duplicates[:5]:  # 只顯示前5個
            print(f"    - {name}: 出現 {len(prices)} 次，價格分別為 {prices[:3]}...")
    
    return all_bill_details

def get_expected_count_from_group_header(page, tab_name=""):
    """從群組標題行獲取預期筆數"""
    expected_count = 0
    
    print(f"正在尋找{tab_name}的群組標題行...")
    
    # 等待資料穩定
    page.wait_for_timeout(2000)
    
    # 方法1: 直接尋找 ag-group-child-count 元素
    try:
        child_count_elements = page.locator('span.ag-group-child-count, span[data-ref="eChildCount"]').all()
        if child_count_elements:
            print(f"找到 {len(child_count_elements)} 個計數元素")
            for element in child_count_elements:
                text = element.text_content(timeout=1000)
                if text and '(' in text and ')' in text:
                    match = re.search(r'\((\d+)\)', text)
                    if match:
                        expected_count = int(match.group(1))
                        print(f"✅ 從計數元素獲取到預期筆數：{expected_count} 筆")
                        return expected_count
    except Exception as e:
        print(f"方法1失敗: {e}")
    
    # 方法2: 從 ag-row-level-1 群組標題行獲取
    try:
        all_detail_rows = page.locator("div.ag-row-level-1").all()
        print(f"找到 {len(all_detail_rows)} 個detail rows")
        
        # 檢查前幾行是否為群組標題行
        for i, row in enumerate(all_detail_rows[:10]):  # 擴大搜尋範圍
            try:
                cell_locators = row.locator('span.ag-cell-value')
                if cell_locators.count() > 0:
                    first_cell_text = cell_locators.first.text_content(timeout=1000)
                    
                    # 檢查是否為群組標題行（包含站名和括號數字）
                    if first_cell_text and '(' in first_cell_text and ')' in first_cell_text:
                        print(f"在第 {i+1} 行找到群組標題行：{first_cell_text}")
                        
                        # 提取括號中的數字
                        match = re.search(r'\((\d+)\)', first_cell_text)
                        if match:
                            expected_count = int(match.group(1))
                            print(f"✅ 成功從群組標題行獲取預期筆數：{expected_count} 筆")
                            return expected_count
            except Exception as e:
                continue
    except Exception as e:
        print(f"方法2失敗: {e}")
    
    if expected_count == 0:
        print(f"⚠️ 警告：無法獲取{tab_name}的預期筆數")
    
    return expected_count

def scrape_monthly_bill(year: int, month: int, customer_name: str) -> dict:
    """
    自動登入 WMS 系統，並抓取指定客戶、指定月份的所有三個tab的帳單明細。
    """
    all_tabs_data = {
        "款項明細": [],
        "其他應退款": [],
        "其他應收款": []
    }
    total_expected = 0
    total_actual = 0
    step = "初始化"
    
    with sync_playwright() as p:
        browser = None
        try:
            step = "啟動瀏覽器"
            browser = p.chromium.launch(headless=True) 
            page = browser.new_page()

            # 1. 登入流程
            step = "導航至登入頁面"
            print("正在登入...")
            page.goto("https://wms.jenjan.com.tw/login", timeout=20000)
            
            step = "填寫帳號"
            page.fill('input[placeholder="example@jenjan.com.tw"]', "jeff02")
            
            step = "填寫密碼"
            page.fill('input[type="password"]', "j93559091")
            
            step = "點擊登入按鈕"
            page.click('button:has-text("登入")')
            
            step = "等待儀表板載入"
            page.wait_for_url("https://wms.jenjan.com.tw/admin/dashboard", timeout=15000)
            print("登入成功，已進入儀表板！")

            # 2. 導航到客戶管理
            step = "點擊「客戶管理」"
            customer_management_link = page.locator('div.menu-title:has-text("客戶管理")')
            customer_management_link.wait_for(state="visible", timeout=10000)
            customer_management_link.click()
            print("已點擊「客戶管理」。")
            
            step = "等待客戶列表頁面載入"
            page.wait_for_url("https://wms.jenjan.com.tw/admin/users", timeout=10000)
            print("已進入客戶列表。")

            # 3. 尋找特定客戶
            step = f"尋找客戶 '{customer_name}'"
            print(f"正在尋找客戶: {customer_name}...")
            
            page.wait_for_selector("div.content-container", timeout=10000)
            customer_row = page.locator(f"//div[contains(@class, 'row') and .//span[@class='ps-2' and text()='{customer_name}']]")
            manage_button = customer_row.locator("span.text-success:has-text('管理')")
            manage_button.wait_for(state="visible", timeout=10000)
            print("找到客戶，點擊「管理」...")
            manage_button.click()

            # 4. 進入款項紀錄
            step = "點擊「款項紀錄」連結"
            bill_record_link = page.locator('a[href*="/bills"]:has-text("款項紀錄")')
            bill_record_link.wait_for(state="visible", timeout=10000)
            print("點擊「款項紀錄」...")
            bill_record_link.click()

            # 5. 定位並展開帳單
            target_date_str = f"{year}/{month:02d}/01"
            step = f"尋找月份為 {target_date_str} 的帳單"
            print(f"正在尋找月份為 {target_date_str} 的帳單...")
            
            page.wait_for_selector('div.ag-root-wrapper', timeout=15000)
            
            try:
                date_cell = page.locator(f"//div[@role='row']//span[text()='{target_date_str}']")
                date_cell.wait_for(state="visible", timeout=10000)
            except TimeoutError:
                raise ValueError(f"在款項紀錄頁面找不到 {year}年{month}月 的帳單，請確認該月份是否確實存在帳單。")
            
            bill_row = page.locator(f"//div[@role='row' and .//span[text()='{target_date_str}']]")
            
            # 展開帳單
            step = "展開帳單明細"
            print("找到帳單，正在展開明細...")
            
            try:
                expand_button = bill_row.locator('svg[role="button"]').first
            except:
                expand_button = bill_row.locator('[aria-expanded="false"]').first
            
            expand_button.click()
            page.wait_for_timeout(2000)
            
            # 確認明細已展開
            try:
                page.wait_for_selector("div.ag-row-level-1", timeout=10000)
                print("偵測到明細已展開！")
            except TimeoutError:
                raise ValueError("已點擊展開按鈕，但在10秒內未出現任何帳單明細。")
            
            # === 爬取第一個Tab: 款項明細 ===
            print("\n" + "="*60)
            print("【Tab 1/3: 款項明細】")
            print("="*60)
            
            # 獲取預期筆數
            expected_count_tab1 = get_expected_count_from_group_header(page, "款項明細")
            
            # 爬取第一個tab的資料
            tab1_data = scrape_tab_data(page, "款項明細", expected_count_tab1)
            all_tabs_data["款項明細"] = tab1_data
            total_expected += expected_count_tab1
            total_actual += len(tab1_data)
            
            # === 爬取第二個Tab: 其他應退款 ===
            print("\n" + "="*60)
            print("【Tab 2/3: 其他應退款】")
            print("="*60)
            
            step = "切換到其他應退款Tab"
            tab2_success = False
            try:
                # 更精確的定位第二個tab按鈕
                tab_container = page.locator('ul.nav.nav-pills').first
                tab2_button = tab_container.locator('li.nav-item').nth(1)  # 0-based index
                
                # 或者直接用文字定位
                if tab2_button.count() == 0:
                    tab2_button = page.locator('li.nav-item:has-text("其他應退款"), li.nav-item:has-text("其他應該款")')
                
                if tab2_button.count() > 0:
                    tab2_button.click()
                    print("已切換到「其他應退款」Tab")
                    page.wait_for_timeout(3000)  # 等待資料載入
                    tab2_success = True
                else:
                    print("❌ 找不到「其他應退款」Tab按鈕")
                
                if tab2_success:
                    # 檢查是否需要展開群組
                    try:
                        expand_buttons = page.locator('svg[role="button"][aria-expanded="false"]').all()
                        if expand_buttons:
                            print(f"發現 {len(expand_buttons)} 個收合的群組，嘗試展開...")
                            for btn in expand_buttons[:1]:  # 只展開第一個
                                btn.click()
                                page.wait_for_timeout(1000)
                    except:
                        pass
                    
                    # 獲取預期筆數
                    expected_count_tab2 = get_expected_count_from_group_header(page, "其他應退款")
                    
                    # 爬取第二個tab的資料
                    tab2_data = scrape_tab_data(page, "其他應退款", expected_count_tab2)
                    all_tabs_data["其他應退款"] = tab2_data
                    total_expected += expected_count_tab2
                    total_actual += len(tab2_data)
                
            except Exception as e:
                print(f"❌ 爬取「其他應退款」Tab時發生錯誤: {e}")
                all_tabs_data["其他應退款"] = []
            
            # === 爬取第三個Tab: 其他應收款 ===
            print("\n" + "="*60)
            print("【Tab 3/3: 其他應收款】")
            print("="*60)
            
            step = "切換到其他應收款Tab"
            tab3_success = False
            try:
                # 更精確的定位第三個tab按鈕
                tab_container = page.locator('ul.nav.nav-pills').first
                tab3_button = tab_container.locator('li.nav-item').nth(2)  # 0-based index
                
                # 或者直接用文字定位
                if tab3_button.count() == 0:
                    tab3_button = page.locator('li.nav-item:has-text("其他應收款")')
                
                if tab3_button.count() > 0:
                    tab3_button.click()
                    print("已切換到「其他應收款」Tab")
                    page.wait_for_timeout(3000)  # 等待資料載入
                    tab3_success = True
                else:
                    print("❌ 找不到「其他應收款」Tab按鈕")
                
                if tab3_success:
                    # 檢查是否需要展開群組
                    try:
                        expand_buttons = page.locator('svg[role="button"][aria-expanded="false"]').all()
                        if expand_buttons:
                            print(f"發現 {len(expand_buttons)} 個收合的群組，嘗試展開...")
                            for btn in expand_buttons[:1]:  # 只展開第一個
                                btn.click()
                                page.wait_for_timeout(1000)
                    except:
                        pass
                    
                    # 獲取預期筆數
                    expected_count_tab3 = get_expected_count_from_group_header(page, "其他應收款")
                    
                    # 爬取第三個tab的資料
                    tab3_data = scrape_tab_data(page, "其他應收款", expected_count_tab3)
                    all_tabs_data["其他應收款"] = tab3_data
                    total_expected += expected_count_tab3
                    total_actual += len(tab3_data)
                
            except Exception as e:
                print(f"❌ 爬取「其他應收款」Tab時發生錯誤: {e}")
                all_tabs_data["其他應收款"] = []
            
            # === 合併所有資料 ===
            all_bill_details = []
            tab_errors = []  # 記錄錯誤的Tab
            failed_tabs = []
            
            for tab_name, tab_data in all_tabs_data.items():
                if len(tab_data) == 0:
                    failed_tabs.append(tab_name)
                else:
                    all_bill_details.extend(tab_data)
            
            # === 輸出詳細統計 ===
            print("\n" + "="*80)
            print("【所有Tab資料統計】")
            print("="*80)
            
            for tab_name in ["款項明細", "其他應退款", "其他應收款"]:
                if tab_name in all_tabs_data:
                    tab_data = all_tabs_data[tab_name]
                    if len(tab_data) > 0:
                        print(f"✅ {tab_name}: {len(tab_data)} 筆")
                        tab_total = sum(item.get('total_price', 0) for item in tab_data)
                        print(f"    金額小計: ${tab_total:,.2f}")
                    else:
                        print(f"⚠️ {tab_name}: 0 筆（可能沒有資料）")
            
            print("-"*80)
            print(f"總計: {len(all_bill_details)} 筆資料")
            
            if all_bill_details:
                total_amount = sum(item.get('total_price', 0) for item in all_bill_details)
                print(f"總金額: ${total_amount:,.2f}")
            
            # 完整性檢查
            completion_rate = 0
            if total_expected > 0:
                completion_rate = (total_actual / total_expected) * 100
                print(f"\n【完整性檢查】")
                print(f"預期總筆數：{total_expected} 筆")
                print(f"實際抓取總筆數：{total_actual} 筆")
                print(f"完成率：{completion_rate:.1f}%")
            
            print("="*80 + "\n")
            
            if not all_bill_details:
                raise ValueError("未能解析任何帳單明細")
            
            # 返回結果（保留tab_source欄位，前端需要它來分類）
            result = {
                'details': all_bill_details,  # 保留tab_source
                'expected_count': total_expected if total_expected > 0 else None,
                'actual_count': total_actual,
                'completion_rate': completion_rate if total_expected > 0 else 0,
                'tab_breakdown': {  # 各tab的統計
                    '款項明細': len(all_tabs_data.get("款項明細", [])),
                    '其他應退款': len(all_tabs_data.get("其他應退款", [])),
                    '其他應收款': len(all_tabs_data.get("其他應收款", []))
                },
                'failed_tabs': failed_tabs if failed_tabs else None  # 失敗的Tab列表
            }
            return result

        except Exception as e:
            error_message = f"在步驟「{step}」時發生錯誤: {e}"
            print(error_message)
            if 'page' in locals() and not page.is_closed():
                page.screenshot(path="error_screenshot.png")
                print("已儲存錯誤畫面截圖至 error_screenshot.png")
            raise Exception(str(e))
        finally:
            if browser:
                browser.close()

if __name__ == '__main__':
    target_year = 2025
    target_month = 7
    target_customer = "韓商鉑岵"

    print("--- 開始執行多Tab調試測試 ---")
    try:
        result = scrape_monthly_bill(target_year, target_month, target_customer)
        details = result['details'] if isinstance(result, dict) else result
        print(f"\n最終結果: {len(details)} 筆資料")
        
        # 顯示統計資訊
        if isinstance(result, dict):
            print(f"預期筆數: {result.get('expected_count', '未知')}")
            print(f"實際抓取: {result.get('actual_count', 0)} 筆")
            print(f"完成率: {result.get('completion_rate', 0):.1f}%")
            
            if 'tab_breakdown' in result:
                print("\n各Tab明細:")
                for tab_name, count in result['tab_breakdown'].items():
                    print(f"  {tab_name}: {count} 筆")
        
        # 顯示前3筆資料
        print("\n【資料預覽】")
        for i, detail in enumerate(details[:3], 1):
            print(f"\n第 {i} 筆:")
            print(f"  Tab來源: {detail.get('tab_source', '未知')}")  # 顯示tab_source
            print(f"  站所: {detail['station']}")
            print(f"  項目: {detail['item_name']}")
            print(f"  單價: {detail['unit_price']}")
            print(f"  數量: {detail['quantity']}")
            print(f"  總價: ${detail['total_price']:,}")
            print(f"  備註: {detail['remark']}")
    except Exception as e:
        print(f"\n--- 測試過程中發生錯誤 ---\n{e}")
    
    print("\n--- 測試結束 ---")