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

    renderAnswers(); // Initial render
})();



