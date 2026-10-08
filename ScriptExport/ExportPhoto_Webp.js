#target photoshop

function exportTrimmedLayersAsWebP() {
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

    var layers = doc.layers;
    var exportedCount = 0;
    
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
    alert("Hoàn tất! Đã xuất định dạng WebP và tự động trim " + exportedCount + " layers.");
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

exportTrimmedLayersAsWebP();