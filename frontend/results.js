(function() {
    const gradingResultsContainer = document.getElementById("gradingResultsContainer");
    const resultsMessage = document.getElementById("resultsMessage");
    const exportCsvButton = document.getElementById("exportCsvButton");
    const refreshResultsButton = document.getElementById("refreshResults");

    let allGradingResults = [];

    function showMessage(msg, type) {
        resultsMessage.textContent = msg;
        resultsMessage.className = `message ${type}`;
        resultsMessage.style.display = "block";
        setTimeout(() => {
            resultsMessage.style.display = "none";
        }, 5000);
    }

    function renderResults() {
        gradingResultsContainer.innerHTML = "";
        const storedResults = localStorage.getItem("gradingResults");
        console.log("读取localStorage结果:", storedResults); // 调试日志

        if (!storedResults) {
            showMessage("暂无批阅结果。请先在'答题卡处理'页面上传并批阅答题卡。", "info");
            return;
        }

        try {
            allGradingResults = JSON.parse(storedResults);
            console.log("解析后的结果:", allGradingResults); // 调试日志
        } catch (error) {
            console.error("解析localStorage数据失败:", error);
            showMessage("数据格式错误，请重新批阅。", "error");
            return;
        }

        if (!Array.isArray(allGradingResults) || allGradingResults.length === 0) {
            showMessage("暂无批阅结果。", "info");
            return;
        }

        allGradingResults.forEach(studentResult => {
            const studentCard = document.createElement("div");
            studentCard.className = "student-card section";

            if (studentResult.error) {
                studentCard.innerHTML = `
                    <h3>文件: ${studentResult.filename}</h3>
                    <p class="incorrect">错误: ${studentResult.error}</p>
                `;
            } else {
                let totalScore = 0;
                let detailHtml =
                    `<h4>得分详情 <button class="grade-detail-toggle">展开/收起</button></h4>
                    <div class="grade-detail" style="display:none;">
                `;

                for (const qNum in studentResult.grading) {
                    const grade = studentResult.grading[qNum];
                    totalScore += grade.score;
                    detailHtml += `
                        <p>
                            题号: ${qNum} | 题型: ${grade.questionType === 'single_choice' ? '选择题' : '填空题'} |
                            标准答案: ${grade.standardAnswer} | 学生答案: ${grade.studentAnswer || '未作答'} |
                            是否正确: <span class="${grade.isCorrect ? 'correct' : 'incorrect'}">${grade.isCorrect ? '是' : '否'}</span> |
                            得分: ${grade.score}
                        </p>
                    `;
                }
                detailHtml += `</div>`;

                studentCard.innerHTML = `
                    <h3>学生: ${studentResult.parsed.name} (文件: ${studentResult.filename})</h3>
                    <p>总分: <strong>${totalScore}</strong></p>
                    ${detailHtml}
                `;
            }
            gradingResultsContainer.appendChild(studentCard);
        });

        // Add event listeners for toggling details
        document.querySelectorAll(".grade-detail-toggle").forEach(button => {
            button.addEventListener("click", (event) => {
                const detailDiv = event.target.parentNode.nextElementSibling;
                if (detailDiv.style.display === "none") {
                    detailDiv.style.display = "block";
                    button.textContent = "收起";
                } else {
                    detailDiv.style.display = "none";
                    button.textContent = "展开";
                }
            });
        });
    }

    exportCsvButton.addEventListener("click", async () => {
        if (allGradingResults.length === 0) {
            showMessage("没有可导出的成绩数据。", "error");
            return;
        }

        showMessage("正在导出CSV文件...", "info");

        try {
            const response = await fetch("http://localhost:3000/api/export", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ gradingResults: allGradingResults }),
            });

            console.log("导出请求发送成功"); // 添加调试日志

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || "CSV导出失败");
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.style.display = "none";
            a.href = url;
            a.download = "成绩报告.csv";
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            showMessage("CSV文件已成功导出！", "success");

        } catch (error) {
            console.error("Error exporting CSV:", error);
            showMessage(`CSV导出失败: ${error.message}`, "error");
        }
    });

    // 刷新按钮事件监听器
    if (refreshResultsButton) {
        refreshResultsButton.addEventListener("click", () => {
            console.log("手动刷新结果...");
            renderResults();
        });
    }

    renderResults();
})();



