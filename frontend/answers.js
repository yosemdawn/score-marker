(function() {
    const questionNumberInput = document.getElementById("questionNumber");
    const answerContentInput = document.getElementById("answerContent");
    const questionTypeSelect = document.getElementById("questionType");
    const questionScoreInput = document.getElementById("questionScore");
    const addAnswerButton = document.getElementById("addAnswer");
    const answersMessage = document.getElementById("answersMessage");
    const answersTableBody = document.querySelector("#answersTable tbody");

    let standardAnswers = JSON.parse(localStorage.getItem("standardAnswers")) || {};

    function saveAnswers() {
        localStorage.setItem("standardAnswers", JSON.stringify(standardAnswers));
        renderAnswers();
    }

    function renderAnswers() {
        answersTableBody.innerHTML = "";

        // 按题号排序（数字优先，否则字母序）
        const sortedKeys = Object.keys(standardAnswers).sort((a, b) => {
            const numA = parseFloat(a);
            const numB = parseFloat(b);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return a.localeCompare(b);
        });

        for (const qNum of sortedKeys) {
            const answer = standardAnswers[qNum];
            const row = answersTableBody.insertRow();
            row.insertCell(0).textContent = qNum;
            row.insertCell(1).textContent = answer.type === "single_choice" ? "单项选择题" : "填空题";
            row.insertCell(2).textContent = answer.content;
            // 分值列：兼容旧数据（无 score 字段时显示"未设置"）
            const scoreCell = row.insertCell(3);
            scoreCell.textContent = answer.score !== undefined ? answer.score + " 分" : "未设置";
            scoreCell.style.color = answer.score !== undefined ? "#333" : "#999";

            const actionsCell = row.insertCell(4);
            const deleteButton = document.createElement("button");
            deleteButton.textContent = "删除";
            deleteButton.className = "button-group secondary";
            deleteButton.onclick = () => {
                delete standardAnswers[qNum];
                saveAnswers();
                showMessage("答案已删除！", "success");
            };
            actionsCell.appendChild(deleteButton);
        }

        // 显示总分统计
        updateTotalScore();
    }

    function updateTotalScore() {
        let existing = document.getElementById("totalScoreSummary");
        if (!existing) {
            existing = document.createElement("p");
            existing.id = "totalScoreSummary";
            existing.style.cssText = "margin-top:12px; font-weight:bold; color:#2c3e50;";
            answersTableBody.closest("table").insertAdjacentElement("afterend", existing);
        }
        const totalQuestions = Object.keys(standardAnswers).length;
        const totalScore = Object.values(standardAnswers).reduce((sum, a) => sum + (a.score || 0), 0);
        existing.textContent = `共 ${totalQuestions} 题，满分合计：${totalScore} 分`;
    }

    function showMessage(msg, type) {
        answersMessage.textContent = msg;
        answersMessage.className = `message ${type}`;
        answersMessage.style.display = "block";
        setTimeout(() => {
            answersMessage.style.display = "none";
        }, 3000);
    }

    addAnswerButton.addEventListener("click", () => {
        const qNum = questionNumberInput.value.trim();
        const content = answerContentInput.value.trim();
        const type = questionTypeSelect.value;
        const scoreRaw = questionScoreInput.value.trim();
        const score = scoreRaw !== "" ? parseFloat(scoreRaw) : undefined;

        if (!qNum || !content) {
            showMessage("题号和答案内容不能为空！", "error");
            return;
        }
        if (scoreRaw !== "" && (isNaN(score) || score < 0)) {
            showMessage("分值必须是大于等于 0 的数字！", "error");
            return;
        }

        standardAnswers[qNum] = { content, type, score };
        saveAnswers();
        showMessage("答案已添加/更新！", "success");
        questionNumberInput.value = "";
        answerContentInput.value = "";
        questionScoreInput.value = "1";
    });

    // 智能分值解析功能
    const parseScoreConfigButton = document.getElementById("parseScoreConfig");
    const scoreDescriptionInput = document.getElementById("scoreDescription");

    if (parseScoreConfigButton && scoreDescriptionInput) {
        parseScoreConfigButton.addEventListener("click", async () => {
            const text = scoreDescriptionInput.value.trim();
            if (!text) {
                showMessage("请输入分值描述！", "error");
                return;
            }

            const doubaoApiKey = localStorage.getItem("doubaoApiKey");
            const doubaoSecretKey = localStorage.getItem("doubaoSecretKey");
            if (!doubaoApiKey) {
                showMessage("请先在系统配置中设置 API Key！", "error");
                return;
            }

            // 禁用按钮，显示加载状态
            parseScoreConfigButton.disabled = true;
            parseScoreConfigButton.textContent = "⏳ 正在解析...";

            try {
                const response = await fetch("http://localhost:3000/api/parse-score-config", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ text, doubaoApiKey, doubaoSecretKey }),
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || "解析失败");
                }

                const result = await response.json();
                const scoreMap = result.scoreMap;

                if (!scoreMap || Object.keys(scoreMap).length === 0) {
                    showMessage("LLM 未能解析出有效的分值配置，请尝试更清晰的描述。", "error");
                    return;
                }

                // 将解析出的分值应用到已录入的标准答案中
                let updatedCount = 0;
                let skippedKeys = [];
                for (const qNum in scoreMap) {
                    if (standardAnswers[qNum]) {
                        standardAnswers[qNum].score = scoreMap[qNum];
                        updatedCount++;
                    } else {
                        skippedKeys.push(qNum);
                    }
                }

                if (updatedCount > 0) {
                    saveAnswers();
                    let msg = `✅ 成功更新 ${updatedCount} 道题的分值！`;
                    if (skippedKeys.length > 0) {
                        msg += ` （${skippedKeys.length} 个题号未录入答案，已跳过：${skippedKeys.slice(0, 10).join(', ')}${skippedKeys.length > 10 ? '...' : ''}）`;
                    }
                    showMessage(msg, "success");
                } else {
                    showMessage("解析出的题号与已录入答案不匹配，请检查题号是否一致。已解析的题号：" + Object.keys(scoreMap).join(', '), "error");
                }
            } catch (error) {
                console.error("分值解析失败:", error);
                showMessage(`解析失败: ${error.message}`, "error");
            } finally {
                parseScoreConfigButton.disabled = false;
                parseScoreConfigButton.textContent = "🤖 智能解析并应用";
            }
        });
    }

    renderAnswers(); // Initial render
})();



