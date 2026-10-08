#target photoshop

// ==========================================
// 1. CÁC HÀM TỪ EXPORT_DIFINE.JS (XUẤT THÔNG TIN JSON)
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
// 2. CÁC HÀM TỪ EXPORT_LAYER_WEBP.JS (XUẤT ẢNH WEBP)
// ==========================================
function exportTrimmedLayersAsWebP(doc) {
    var exportedCount = 0;
    var layers = doc.layers;
    var originalDialogMode = app.displayDialogs;
    app.displayDialogs = DialogModes.NO;

    for (var i = 0; i < layers.length; i++) {
        var currentGroup = layers[i];

        if (currentGroup.typename === "LayerSet") {
            var groupName = currentGroup.name;
            var targetFolder = new Folder(doc.path + "/" + groupName);
            
            if (!targetFolder.exists) {
                targetFolder.create();
            }

            var subLayers = currentGroup.layers;
            
            for (var j = 0; j < subLayers.length; j++) {
                var subLayer = subLayers[j];
                
                var safeLayerName = subLayer.name.replace(/[:\/\\*\?\"<>\|]/g, "_");
                var destFile = new File(targetFolder + "/" + safeLayerName + ".webp");
                
                exportSingleLayerAsWebP(subLayer, destFile, doc);
                exportedCount++;
            }
        }
    }
    
    app.displayDialogs = originalDialogMode;
    return exportedCount;
}

function exportSingleLayerAsWebP(layer, destFile, originalDoc) {
    var tempDoc = app.documents.add(originalDoc.width, originalDoc.height, originalDoc.resolution, "TempDoc", NewDocumentMode.RGB, DocumentFill.TRANSPARENT);
    
    app.activeDocument = originalDoc;
    var dupeLayer = layer.duplicate(tempDoc, ElementPlacement.PLACEATBEGINNING);
    
    app.activeDocument = tempDoc;
    dupeLayer.visible = true;
    
    try {
        var defaultLayer = tempDoc.artLayers.getByName("Layer 1");
        if (defaultLayer && defaultLayer !== dupeLayer) {
            defaultLayer.remove();
        }
    } catch(e) {}

    try {
        tempDoc.trim(TrimType.TRANSPARENT, true, true, true, true);
        
        // Gọi hàm lưu WebP
        saveWebP(destFile, 80);
        
    } catch (e) {
        // Bỏ qua nếu layer trống hoàn toàn
    }
    
    tempDoc.close(SaveOptions.DONOTSAVECHANGES);
    app.activeDocument = originalDoc;
}

function saveWebP(destFile, quality) {
    function s2t(s) {
        return app.stringIDToTypeID(s);
    }
    
    var descriptor = new ActionDescriptor();
    var descriptor2 = new ActionDescriptor();
    
    // Thiết lập thông số nén WebP
    descriptor2.putEnumerated(s2t("compression"), s2t("WebPCompression"), s2t("compressionLossy"));
    descriptor2.putInteger(s2t("quality"), quality); // Chất lượng (0 - 100)
    descriptor2.putBoolean(s2t("includeXMPData"), false);
    descriptor2.putBoolean(s2t("includeEXIFData"), false);
    descriptor2.putBoolean(s2t("includePsExtras"), false);
    
    descriptor.putObject(s2t("as"), s2t("WebPFormat"), descriptor2);
    descriptor.putPath(s2t("in"), destFile);
    descriptor.putBoolean(s2t("copy"), true);
    descriptor.putBoolean(s2t("lowerCase"), true);
    
    try {
        executeAction(s2t("save"), descriptor, DialogModes.NO);
    } catch (e) {
        // Fallback phòng hờ: nếu máy lỗi định dạng WebP, tự động đổi sang lưu PNG chất lượng cao
        var pngOpts = new PNGSaveOptions();
        app.activeDocument.saveAs(new File(destFile.fullName.replace(/\.webp$/, ".png")), pngOpts, true, Extension.LOWERCASE);
    }
}

// ==========================================
// 3. CHƯƠNG TRÌNH CHÍNH (MAIN PROCESS)
// ==========================================
function main() {
    if (app.documents.length === 0) {
        alert("Vui lòng mở một file Photoshop trước khi chạy script!");
        return;
    }

    var doc = app.activeDocument;
    
    try {
        var docPath = doc.path;
    } catch (e) {
        alert("Vui lòng lưu file PSD của bạn trước khi chạy script này!");
        return;
    }

    // BƯỚC 1: Xuất file JSON (define.json)
    var docWidth = doc.width.as("px");
    var docHeight = doc.height.as("px");

    var shapeData = {
        "designWidth": Math.round(docWidth * 100) / 100,
        "designHeight": Math.round(docHeight * 100) / 100,
        "layers": processLayers(doc.layers)
    };

    var exportPath = doc.path + "/define.json";
    var file = new File(exportPath);
    file.encoding = "UTF-8";
    file.open("w");
    file.write(simpleJSONStringify(shapeData));
    file.close();

    // BƯỚC 2: Xuất layers thành ảnh WebP
    var exportedCount = exportTrimmedLayersAsWebP(doc);

    // Thông báo khi hoàn thành tất cả
    alert("Thành công!\n1. Đã xuất thông tin thiết kế ra file define.json cùng thư mục PSD.\n2. Đã xuất định dạng WebP và tự động trim " + exportedCount + " layers.");
}

// Bắt đầu chạy
main();
