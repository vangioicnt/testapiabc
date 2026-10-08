#target photoshop

// ==========================================
// 1. HÀM ĐỆ QUY TÌM GÓC XOAY VÀ TỌA ĐỘ GỐC
// ==========================================
function getShapeData(layer) {
    var result = {
        rotation: 0,
        originX: null,
        originY: null
    };

    try {
        var ref = new ActionReference();
        ref.putIdentifier(charIDToTypeID("Lyr "), layer.id); 
        var desc = executeActionGet(ref);

        findAngleAndOriginRecursive(desc, result);
    } catch (e) {}

    return result;
}

function findAngleAndOriginRecursive(desc, result) {
    if (!desc) return;
    try {
        var hasXX = false, hasXY = false;
        var xx = 0, xy = 0;
        
        var count = desc.count;
        for (var i = 0; i < count; i++) {
            var key = desc.getKey(i);
            var type = desc.getType(key);
            
            var keyName = "";
            try { keyName = typeIDToStringID(key); } catch(e) {}
            
            if (keyName === "xx") {
                xx = desc.getDouble(key);
                hasXX = true;
            } else if (keyName === "xy") {
                xy = desc.getDouble(key);
                hasXY = true;
            }
            
            // Lấy tọa độ từ góc hộp nguyên bản trước khi xoay tâm
            if (keyName === "keyOriginBoxCorners" && type == DescValueType.OBJECTTYPE) {
                var corners = desc.getObjectValue(key);
                try {
                    var cornerA = corners.getObjectValue(stringIDToTypeID("rectangleCornerA"));
                    result.originX = cornerA.getDouble(stringIDToType("horizontal"));
                    result.originY = cornerA.getDouble(stringIDToType("vertical"));
                } catch(err) {}
            }
            
            if (type == DescValueType.OBJECTTYPE) {
                findAngleAndOriginRecursive(desc.getObjectValue(key), result);
            } else if (type == DescValueType.LISTTYPE) {
                findInList(desc.getList(key), result);
            }
        }
        
        if (hasXX && hasXY) {
            var angle = Math.atan2(xy, xx) * (180.0 / Math.PI);
            var finalAngle = Math.round(angle * 100) / 100;
            result.rotation = (finalAngle === -0 ? 0 : finalAngle);
        }
    } catch(e) {}
}

function findInList(list, result) {
    if (!list) return;
    try {
        var count = list.count;
        for (var i = 0; i < count; i++) {
            var type = list.getType(i);
            if (type == DescValueType.OBJECTTYPE) {
                findAngleAndOriginRecursive(list.getObjectValue(i), result);
            } else if (type == DescValueType.LISTTYPE) {
                findInList(list.getList(i), result);
            }
        }
    } catch(e) {}
}

// ==========================================
// 2. HÀM ĐỆ QUY XỬ LÝ NHÓM (LAYERSET) VÀ LAYER
// ==========================================
function processLayers(layersContainer) {
    var layersList = [];
    for (var i = 0; i < layersContainer.length; i++) {
        var layer = layersContainer[i];
        
        // Bỏ qua Background layer và layer ẩn
        if (layer.isBackgroundLayer || !layer.visible) continue;

        if (layer.typename === "LayerSet") {
            // Nếu là Group (thư mục chứa layer), tạo cấu trúc nhóm
            var groupInfo = {
                "groupName": layer.name,
                "opacity": Math.round(layer.opacity),
                "layers": processLayers(layer.layers)
            };
            layersList.push(groupInfo);
        } else {
            // Nếu là Layer thường
            var info = getShapeData(layer);

            var rawPx = info.originX !== null ? info.originX : layer.bounds[0].value;
            var rawPy = info.originY !== null ? info.originY : layer.bounds[1].value;

            // Lấy width và height chính xác qua bounds
            var lBounds = layer.bounds;
            var rawWidth = lBounds[2].as("px") - lBounds[0].as("px");
            var rawHeight = lBounds[3].as("px") - lBounds[1].as("px");

            var layerInfo = {
                "name": layer.name,
                "px": Math.round(rawPx * 100) / 100,
                "py": Math.round(rawPy * 100) / 100,
                "width": Math.round(rawWidth * 100) / 100,
                "height": Math.round(rawHeight * 100) / 100,
                "opacity": Math.round(layer.opacity),
                "rotation": info.rotation
            };
            layersList.push(layerInfo);
        }
    }
    return layersList;
}

// ==========================================
// 3. HÀM CHUYỂN OBJECT THÀNH JSON STRING (Polyfill)
// ==========================================
function simpleJSONStringify(obj) {
    var t = typeof (obj);
    if (t != "object" || obj === null) {
        if (t == "string") obj = '"' + obj.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
        return String(obj);
    } else {
        var n, v, json = [], arr = (obj && obj.constructor == Array);
        for (n in obj) {
            v = obj[n]; t = typeof(v);
            if (t == "string") v = '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
            else if (t == "object" && v !== null) v = simpleJSONStringify(v);
            json.push((arr ? "" : '"' + n + '":') + String(v));
        }
        return (arr ? "[" : "{") + String(json) + (arr ? "]" : "}");
    }
}

// ==========================================
// 4. CHƯƠNG TRÌNH CHÍNH (MAIN PROCESS)
// ==========================================
if (app.documents.length > 0) {
    var doc = app.activeDocument;
    
    var docWidth = doc.width.as("px");
    var docHeight = doc.height.as("px");

    var shapeData = {
        "designWidth": Math.round(docWidth * 100) / 100,
        "designHeight": Math.round(docHeight * 100) / 100,
        "layers": processLayers(doc.layers)
    };

    // Ghi file JSON ra Desktop
    var exportPath = doc.path + "/define.json";
    var file = new File(exportPath);
    file.encoding = "UTF-8";
    file.open("w");
    file.write(simpleJSONStringify(shapeData));
    file.close();
    
    alert("Thành công!\nĐã xuất thông tin thiết kế và cấu trúc nhóm layer ra Desktop.\nTên file: shapes_export.json");
} else {
    alert("Vui lòng mở một file Photoshop trước khi chạy script!");
}