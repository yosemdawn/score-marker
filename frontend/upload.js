(function() {
    const fileUploadArea = document.getElementById("fileUploadArea");
    const fileInput = document.getElementById("fileInput");
    const fileList = document.getElementById("fileList");
    const processFilesButton = document.getElementById("processFiles");
    const uploadMessage = document.getElementById("uploadMessage");

    let selectedFiles = [];

    // Helper to show messages
    function showMessage(msg, type) {
        uploadMessage.textContent = msg;
        uploadMessage.className = `message ${type}`;
        uploadMessage.style.display = "block";
        setTimeout(() => {
            uploadMessage.style.display = "none";
        }, 5000);
    }

    // Compress image to reduce file size
    async function compressImage(file, maxSizeMB = 9) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();

            img.onload = () => {
                // Calculate new dimensions to reduce file size
                let { width, height } = img;

                // If image is very large, reduce dimensions
                const maxDimension = 2000;
                if (width > maxDimension || height > maxDimension) {
                    if (width > height) {
                        height = (height * maxDimension) / width;
                        width = maxDimension;
                    } else {
                        width = (width * maxDimension) / height;
                        height = maxDimension;
                    }
                }

                canvas.width = width;
                canvas.height = height;

                // Draw and compress
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    const compressedFile = new File([blob], file.name, {
                        type: file.type,
                        lastModified: Date.now()
                    });
                    resolve(compressedFile);
                }, file.type, 0.8); // 0.8 quality for JPEG compression
            };

            img.src = URL.createObjectURL(file);
        });
    }

    // Handle file selection
    async function handleFiles(files) {
        for (const file of files) {
            if (file.type === "image/jpeg" || file.type === "image/png") {
                // Check file size and compress if needed
                if (file.size > 9 * 1024 * 1024) { // 9MB to leave room for base64 encoding overhead
                    showMessage(`正在压缩图片 ${file.name}...`, "info");
                    try {
                        const compressedFile = await compressImage(file);
                        selectedFiles.push(compressedFile);
                        showMessage(`图片 ${file.name} 已压缩完成！`, "success");
                    } catch (error) {
                        showMessage(`压缩图片 ${file.name} 失败: ${error.message}`, "error");
                        continue;
                    }
                } else {
                    selectedFiles.push(file);
                }
            } else {
                showMessage(`文件 ${file.name} 不是有效的图片格式 (JPG/PNG)。`, "error");
            }
        }
        renderFileList();
    }

    // Render file list
    function renderFileList() {
        fileList.innerHTML = "";
        selectedFiles.forEach((file, index) => {
            const listItem = document.createElement("li");
            listItem.textContent = file.name;
            const removeButton = document.createElement("button");
            removeButton.textContent = "X";
            removeButton.className = "remove-file";
            removeButton.onclick = () => {
                selectedFiles.splice(index, 1);
                renderFileList();
            };
            listItem.appendChild(removeButton);
            fileList.appendChild(listItem);
        });
    }

    // Drag and drop functionality
    fileUploadArea.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", (event) => handleFiles(event.target.files));

    fileUploadArea.addEventListener("dragover", (event) => {
        event.preventDefault();
        fileUploadArea.classList.add("drag-over");
    });

    fileUploadArea.addEventListener("dragleave", (event) => {
        event.preventDefault();
        fileUploadArea.classList.remove("drag-over");
    });

    fileUploadArea.addEventListener("drop", (event) => {
        event.preventDefault();
        fileUploadArea.classList.remove("drag-over");
        handleFiles(event.dataTransfer.files);
    });

    // Process files
    processFilesButton.addEventListener("click", async () => {
        if (selectedFiles.length === 0) {
            showMessage("请先选择答题卡图片！", "error");
            return;
        }

        showMessage("正在上传并批阅答题卡，请稍候...", "success");

        const formData = new FormData();
        selectedFiles.forEach(file => {
            formData.append("files", file);
        });

        const doubaoApiKey = localStorage.getItem("doubaoApiKey");
        const doubaoSecretKey = localStorage.getItem("doubaoSecretKey");
        const standardAnswers = localStorage.getItem("standardAnswers");

        if (doubaoApiKey) {
            formData.append("doubaoApiKey", doubaoApiKey);
            if (doubaoSecretKey) {
                formData.append("doubaoSecretKey", doubaoSecretKey);
            }
        } else {
            showMessage("请在系统配置中设置豆包LLM API Key！", "error");
            return;
        }

        if (standardAnswers) {
            formData.append("standardAnswers", standardAnswers);
        } else {
            showMessage("请先在'标准答案管理'页面录入标准答案！", "error");
            return;
        }

        try {
            const response = await fetch("http://localhost:3000/api/process", {
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || "批阅失败");
            }

            const result = await response.json();
            console.log("批阅结果:", result); // 添加调试日志

            // 确保结果格式正确
            if (result && result.items && Array.isArray(result.items)) {
                localStorage.setItem("gradingResults", JSON.stringify(result.items));
                console.log("结果已保存到localStorage:", result.items.length, "个文件");

                showMessage(`批阅完成！共处理 ${result.items.length} 张答题卡，正在跳转到成绩展示页面...`, "success");
                selectedFiles = []; // Clear files after processing
                renderFileList();

                // Auto navigate to results page after 3 seconds
                setTimeout(() => {
                    console.log("开始跳转到成绩页面...");
                    document.getElementById('nav-results').click();
                }, 3000);
            } else {
                throw new Error("服务器返回结果格式不正确");
            }

        } catch (error) {
            console.error("Error processing files:", error);
            showMessage(`批阅失败: ${error.message}`, "error");
        }
    });
})();



