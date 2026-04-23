(() => {

    let editor;
    let id = null;
    let isSaving = false;

    async function init() {
        const editorContainer = document.getElementById("contenidoEditor");
        const saveBtn = document.getElementById("saveBtn");
        const titleInput = document.getElementById("titulo");

        if (!editorContainer || !saveBtn || !titleInput) {
            return;
        }

        await ensureTinyMceAssets();
        await createTinyMceEditor();

        const queryId = new URLSearchParams(window.location.search).get("id");
        id = window.__bitacoraEditId || queryId || null;

        if (id) {
            await loadBitacora();
        }

        saveBtn.addEventListener("click", saveBitacora);
    }

    async function ensureTinyMceAssets() {
        const cssHref = "https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap";
        const jsSrc = "https://cdn.tiny.cloud/1/xbweztr37sjt2kko6o6hk8hql66ka5p4xwldx8yg190k8fdw/tinymce/7/tinymce.min.js";

        if (!document.querySelector(`link[data-tinymce-fonts='true']`)) {
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = cssHref;
            link.dataset.tinymceFonts = "true";
            document.head.appendChild(link);
        }

        if (window.tinymce) {
            return;
        }

        await new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[data-tinymce='true']`);
            if (existing) {
                existing.addEventListener("load", resolve, { once: true });
                existing.addEventListener("error", reject, { once: true });
                return;
            }

            const script = document.createElement("script");
            script.src = jsSrc;
            script.referrerPolicy = "origin";
            script.dataset.tinymce = "true";
            script.onload = resolve;
            script.onerror = reject;
            document.body.appendChild(script);
        });
    }

    async function createTinyMceEditor() {
        if (window.tinymce.get("contenidoEditor")) {
            window.tinymce.get("contenidoEditor").remove();
        }

        await window.tinymce.init({
            selector: "#contenidoEditor",
            promotion: false,
            branding: false,
            height: 620,
            min_height: 520,
            menubar: "file edit view insert format tools table help",
            toolbar_mode: "sliding",
            plugins: [
                "advlist", "autolink", "lists", "link", "image", "charmap", "preview", "anchor",
                "searchreplace", "visualblocks", "code", "fullscreen", "insertdatetime", "media",
                "table", "wordcount", "help", "emoticons", "codesample"
            ],
            toolbar: [
                "undo redo | blocks fontfamily fontsize styles | bold italic underline strikethrough",
                "forecolor backcolor | alignleft aligncenter alignright alignjustify",
                "bullist numlist outdent indent | link image media table | emoticons charmap codesample",
                "removeformat | searchreplace visualblocks code fullscreen preview help"
            ],
            quickbars_selection_toolbar: "bold italic | blocks | forecolor backcolor | quicklink blockquote",
            quickbars_insert_toolbar: "image media table",
            quickbars_image_toolbar: "alignleft aligncenter alignright | imageoptions",
            font_family_formats:
                "Arial=arial,helvetica,sans-serif;" +
                "Comic Sans MS=comic sans ms,cursive;" +
                "Courier New=courier new,courier,monospace;" +
                "Georgia=georgia,palatino,serif;" +
                "Tahoma=tahoma,arial,helvetica,sans-serif;" +
                "Times New Roman=times new roman,times,serif;" +
                "Trebuchet MS=trebuchet ms,geneva,sans-serif;" +
                "Verdana=verdana,geneva,sans-serif;" +
                "Roboto=roboto,sans-serif",
            font_size_formats: "8pt 9pt 10pt 11pt 12pt 14pt 16pt 18pt 20pt 24pt 28pt 32pt 36pt 48pt 72pt",
            image_title: true,
            image_advtab: true,
            image_caption: true,
            automatic_uploads: true,
            paste_data_images: true,
            file_picker_types: "image",
            object_resizing: "img",
            style_formats: [
                {
                    title: "Imagen: Flotar izquierda",
                    selector: "img",
                    styles: {
                        float: "left",
                        margin: "0 14px 10px 0",
                        display: "inline"
                    }
                },
                {
                    title: "Imagen: Flotar derecha",
                    selector: "img",
                    styles: {
                        float: "right",
                        margin: "0 0 10px 14px",
                        display: "inline"
                    }
                },
                {
                    title: "Imagen: Centrada",
                    selector: "img",
                    styles: {
                        display: "block",
                        margin: "12px auto",
                        float: "none"
                    }
                },
                {
                    title: "Imagen: Sin ajuste",
                    selector: "img",
                    styles: {
                        display: "inline",
                        margin: "0",
                        float: "none"
                    }
                }
            ],
            extended_valid_elements: "img[class|src|border=0|alt|title|width|height|style|data*]",
            valid_styles: {
                "*": "color,font-size,font-family,background-color,text-align,float,margin,display,width,height,max-width,border,border-radius"
            },
            file_picker_callback(callback, value, meta) {
                if (meta.filetype !== "image") {
                    return;
                }

                const input = document.createElement("input");
                input.type = "file";
                input.accept = "image/*";

                input.onchange = async () => {
                    const file = input.files?.[0];
                    if (!file) {
                        return;
                    }

                    try {
                        const optimizedDataUrl = await compressImageToDataUrl(file, 1600, 0.78);
                        callback(optimizedDataUrl, {
                            title: file.name
                        });
                    } catch (error) {
                        console.error("Error optimizando imagen:", error);
                        alert("No se pudo procesar la imagen seleccionada");
                    }
                };

                input.click();
            },
            images_upload_handler: async (blobInfo, progress) => {
                progress(15);
                const optimizedDataUrl = await compressImageToDataUrl(blobInfo.blob(), 1600, 0.78);
                progress(100);
                return optimizedDataUrl;
            },
            content_style: `
                body { font-family: Georgia, serif; font-size: 15px; line-height: 1.6; color: #1f2937; }
                img { max-width: 100%; height: auto; cursor: move; }
                figure.image { margin: 12px 0; }
            `
        });

        editor = window.tinymce.get("contenidoEditor");
    }

    async function loadBitacora() {
        try {
            const res = await apiFetch(`/api/bitacoras/${id}`);
            const data = await res.json();

            if (!data.success) {
                throw new Error(data.message || "Error al cargar la bitácora");
            }

            document.getElementById("titulo").value = data.data.titulo;
            if (editor) {
                editor.setContent(data.data.contenido || "");
            }

        } catch (error) {
            console.error("Error:", error);
            alert("Error al cargar la bitácora: " + error.message);
        }
    }

    async function saveBitacora() {
        if (isSaving) {
            return;
        }

        const titulo = document.getElementById("titulo").value.trim();
        const saveBtn = document.getElementById("saveBtn");

        if (!editor) {
            alert("El editor todavía no está listo");
            return;
        }

        const contenido = editor.getContent();
        const plainText = editor.getContent({ format: "text" }).trim();

        if (!titulo) {
            alert("Por favor ingresa un título");
            return;
        }

        if (!plainText) {
            alert("Por favor ingresa contenido en la bitácora");
            return;
        }

        const payload = { titulo, contenido };
        const payloadSizeBytes = new TextEncoder().encode(JSON.stringify(payload)).length;
        const maxSafePayload = 10 * 1024 * 1024;

        if (payloadSizeBytes > maxSafePayload) {
            alert("El contenido es demasiado grande. Reduce tamaño/cantidad de imágenes e intenta de nuevo.");
            return;
        }

        try {
            isSaving = true;
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.textContent = "Guardando...";
            }

            const res = await apiFetch(
                id ? `/api/bitacoras/${id}` : `/api/bitacoras`,
                {
                    method: id ? "PUT" : "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                }
            );

            const rawResponse = await res.text();
            let data;

            try {
                data = rawResponse ? JSON.parse(rawResponse) : {};
            } catch (parseError) {
                throw new Error(`Respuesta inválida del servidor (HTTP ${res.status})`);
            }

            if (!res.ok || !data.success) {
                throw new Error(data.message || `Error al guardar (HTTP ${res.status})`);
            }

            window.__bitacoraEditId = null;
            loadView("views/bitacoras.html", "css/bitacoras.css", "js/bitacoras.js");
        } catch (error) {
            console.error("Error:", error);
        } finally {
            isSaving = false;
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = "Guardar";
            }
        }
    }

    async function compressImageToDataUrl(fileOrBlob, maxWidth = 1600, quality = 0.78) {
        const imageBitmap = await createImageBitmap(fileOrBlob);

        const sourceWidth = imageBitmap.width;
        const sourceHeight = imageBitmap.height;

        const scale = sourceWidth > maxWidth ? (maxWidth / sourceWidth) : 1;
        const targetWidth = Math.round(sourceWidth * scale);
        const targetHeight = Math.round(sourceHeight * scale);

        const canvas = document.createElement("canvas");
        canvas.width = targetWidth;
        canvas.height = targetHeight;

        const ctx = canvas.getContext("2d", { alpha: false });
        ctx.drawImage(imageBitmap, 0, 0, targetWidth, targetHeight);

        imageBitmap.close();

        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        return dataUrl;
    }

    init();

})();