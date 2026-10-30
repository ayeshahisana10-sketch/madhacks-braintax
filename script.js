/* =========================================================
   BRAIN TAX — MAIN APPLICATION
   Search → Charge → Blink → Countdown → Fake Question
   → CAPTCHA → Real Questions → Tax Wheel → Nose Scan
   → Final Betrayal
   ========================================================= */

"use strict";

/* -------------------- HELPERS -------------------- */

const $ = (id) => document.getElementById(id);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const randomItem = (array) =>
    array[Math.floor(Math.random() * array.length)];

const shuffle = (array) =>
    [...array].sort(() => Math.random() - 0.5);

function setText(id, value) {
    const element = $(id);
    if (element) element.textContent = value;
}

function setWidth(id, percentage) {
    const element = $(id);
    if (element) {
        element.style.width = `${Math.max(0, Math.min(100, percentage))}%`;
    }
}

function show(id) {
    const element = $(id);
    if (element) element.hidden = false;
}

function hide(id) {
    const element = $(id);
    if (element) element.hidden = true;
}

function setStatus(id, message) {
    setText(id, message);
}

function setFeedback(id, message, type = "") {
    const element = $(id);
    if (!element) return;

    element.textContent = message;
    element.classList.remove("correct", "incorrect");

    if (type) element.classList.add(type);
}

function safeCall(callback) {
    try {
        callback();
    } catch (error) {
        console.error(error);
    }
}

/* -------------------- APP STATE -------------------- */

const state = {
    searchQuery: "",
    soundEnabled: true,

    chargeStarted: false,
    blinkCount: 0,
    blinkTestPassed: false,

    fakeQuestionCount: 0,

    correct: 0,
    incorrect: 0,
    timedOut: 0,

    currentQuestion: null,
    currentQuestionIndex: 0,
    questionSet: [],

    questionAnswered: false,
    taxResult: "",
    wheelSpinning: false,
    noseScanComplete: false,

    cameraStream: null,
    noseStream: null,

    faceMesh: null,
    blinkDetectionRunning: false,
    previousEyeState: "open",
    eyeClosedFrames: 0,
    eyeOpenFrames: 0,
    lastBlinkTime: 0,

    timers: new Set(),
    intervals: new Set(),
    speechUtterance: null
};

/* -------------------- TIMER MANAGEMENT -------------------- */

function managedTimeout(callback, delay) {
    const timer = setTimeout(() => {
        state.timers.delete(timer);
        callback();
    }, delay);

    state.timers.add(timer);
    return timer;
}

function managedInterval(callback, delay) {
    const timer = setInterval(callback, delay);
    state.intervals.add(timer);
    return timer;
}

function clearAllTimers() {
    state.timers.forEach(clearTimeout);
    state.intervals.forEach(clearInterval);

    state.timers.clear();
    state.intervals.clear();
}

function cancelSpeech() {
    if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
    }

    state.speechUtterance = null;
    stopTaxiTalking();
}

/* -------------------- CAMERA CLEANUP -------------------- */

function stopStream(stream) {
    if (stream) {
        stream.getTracks().forEach((track) => track.stop());
    }
}

function stopBlinkCamera() {
    state.blinkDetectionRunning = false;

    stopStream(state.cameraStream);
    state.cameraStream = null;

    const video = $("blink-video");

    if (video) {
        video.pause();
        video.srcObject = null;
    }

    if (state.faceMesh) {
        safeCall(() => state.faceMesh.close());
        state.faceMesh = null;
    }

    hide("blink-camera-placeholder");
}

function stopNoseCamera() {
    stopStream(state.noseStream);
    state.noseStream = null;

    const video = $("nose-video");

    if (video) {
        video.pause();
        video.srcObject = null;
    }
}

function cleanupCameras() {
    stopBlinkCamera();
    stopNoseCamera();
}

/* -------------------- SCREEN NAVIGATION -------------------- */

const screens = [
    "home-screen",
    "charge-screen",
    "blink-screen",
    "countdown-screen",
    "fake-question-screen",
    "captcha-screen",
    "real-question-screen",
    "tax-wheel-screen",
    "nose-scan-screen",
    "final-screen"
];

function goToScreen(screenId) {
    screens.forEach((id) => {
        const element = $(id);
        if (!element) return;

        element.classList.remove("active");
        element.hidden = true;
    });

    const destination = $(screenId);

    if (!destination) {
        console.error("Screen not found:", screenId);
        return;
    }

    destination.hidden = false;
    destination.classList.add("active");

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });

    updateTaxiForScreen(screenId);
}

function updateTaxiForScreen(screenId) {
    const messages = {
        "home-screen":
            "Welcome! Every search comes with a completely unnecessary fee.",

        "charge-screen":
            "Your brain is at 2%. Have you tried turning your intelligence off and on again?",

        "blink-screen":
            "Please blink ten times. No, staring at the screen does not count.",

        "countdown-screen":
            "I can't let that brain be drowsy.",

        "fake-question-screen":
            "The question paper has gone missing. The deadline remains.",

        "captcha-screen":
            "Letters and numbers are present. Your input should contain digits only.",

        "real-question-screen":
            "The department has finally located its question paper. Unfortunately.",

        "tax-wheel-screen":
            "Spin the wheel. Your financial suffering is just beginning.",

        "nose-scan-screen":
            "Your nose has been selected for a completely unnecessary inspection.",

        "final-screen":
            "Your refund has been postponed indefinitely."
    };

    setText("taxi-speech", messages[screenId] || "Please pay your brain tax.");
    stopTaxiTalking();
    taxiReact(screenId === "fake-question-screen" ? "shocked" : "smile");
}

/* -------------------- TAXI ASSISTANT -------------------- */

const taxiLines = [
    "Please understand… your brain cells are a limited resource. Every unnecessary thought comes with a tax!",
    "I would like to clarify that overthinking is not tax-free anymore!",
    "The department has observed excessive brain activity. You are hereby advised to reduce unnecessary thinking!",
    "Main itna overthink nahi karti hoon ji! 😂"
];

const taxiExtraLines = [
    "I can’t let that brain be drowsy.",
    "Your refund application is currently under emotional review.",
    "Please remain calm. Panic is subject to additional charges.",
    "The department appreciates your patience. We will now tax it.",
    "You have successfully completed absolutely unnecessary paperwork.",
    "Your common sense has been forwarded to the concerned department."
];

// Presentation state stays separate from game timers and scoring.
let taxiReactionTimer;
let taxiTalkingTimer;
function taxiReact(expression = "smile", duration = 6000) {
    clearTimeout(taxiReactionTimer);
    const assistant = $("taxi-assistant");
    if (!assistant) return;
    assistant.dataset.expression = expression;
    if (expression !== "smile") {
        taxiReactionTimer = setTimeout(() => { assistant.dataset.expression = "smile"; }, duration);
    }
}
function stopTaxiTalking() {
    clearTimeout(taxiTalkingTimer);
    $("taxi-assistant")?.classList.remove("is-talking");
}
function animateTaxiTalking(text) {
    stopTaxiTalking();
    $("taxi-assistant")?.classList.add("is-talking");
    taxiTalkingTimer = setTimeout(stopTaxiTalking, Math.min(9000, Math.max(1400, text.length * 48)));
}

function speak(text) {
    if (!state.soundEnabled || !("speechSynthesis" in window)) return;

    cancelSpeech();

    const utterance = new SpeechSynthesisUtterance(text);

    utterance.lang = "en-IN";
    utterance.rate = 0.94;
    utterance.pitch = 1.08;
    utterance.volume = 1;

    const voices = window.speechSynthesis.getVoices();

    const preferredVoice =
        voices.find((voice) =>
            /en-IN/i.test(voice.lang) &&
            /female|heera|priya/i.test(voice.name)
        ) ||
        voices.find((voice) => /en-IN/i.test(voice.lang)) ||
        voices.find((voice) => /en-GB|en-US/i.test(voice.lang));

    if (preferredVoice) utterance.voice = preferredVoice;

    utterance.onstart = () => {
        if (state.speechUtterance === utterance) animateTaxiTalking(text);
    };
    const finishSpeech = () => {
        if (state.speechUtterance === utterance) {
            stopTaxiTalking();
            state.speechUtterance = null;
        }
    };
    utterance.onend = finishSpeech;
    utterance.onerror = finishSpeech;
    state.speechUtterance = utterance;
    window.speechSynthesis.speak(utterance);
}

function taxiTalk(text, shouldSpeak = true, expression = "smile") {
    setText("taxi-speech", text);

    taxiReact(expression);
    if (shouldSpeak) speak(text);
    animateTaxiTalking(text);
}

function repeatTaxiDialogue() {
    const message = $("taxi-speech")?.textContent;

    if (message) speak(message);
}

function toggleSound() {
    state.soundEnabled = !state.soundEnabled;

    const button = $("taxi-sound-button");

    if (button) {
        button.textContent = state.soundEnabled
            ? "🔈 Sound on"
            : "🔇 Sound off";

        button.setAttribute(
            "aria-pressed",
            String(state.soundEnabled)
        );
    }

    if (!state.soundEnabled) {
        cancelSpeech();
    } else {
        speak("TAXI audio has been activated. Your peace has ended.");
    }
}

$("taxi-repeat-button")?.addEventListener("click", repeatTaxiDialogue);
$("taxi-sound-button")?.addEventListener("click", toggleSound);

$("taxi-avatar-button")?.addEventListener("click", () => {
    const line = randomItem([...taxiLines, ...taxiExtraLines]);
    taxiTalk(line, true, randomItem(["laugh", "shocked", "angry", "disappointed"]));
});

/* -------------------- STAGE 1: SEARCH -------------------- */

$("search-form")?.addEventListener("submit", (event) => {
    event.preventDefault();

    const input = $("search-input");
    const query = input?.value.trim();

    if (!query) {
        input?.focus();
        return;
    }

    state.searchQuery = query;

    setText("final-search-query", query);

    goToScreen("charge-screen");

    taxiTalk(
        `Search registered: ${query}. Please prepare to pay in brain cells.`
    );
});

/* -------------------- STAGE 2: BRAIN CHARGING -------------------- */

async function chargeBrain() {
    if (state.chargeStarted) return;

    state.chargeStarted = true;

    const button = $("charge-button");

    if (button) {
        button.disabled = true;
        button.textContent = "⚡ Charging...";
    }

    const statusMessages = [
        "Locating your neurons...",
        "Connecting brain cells...",
        "Installing unnecessary confidence...",
        "Calculating mental tax...",
        "Brain charged. Common sense unavailable."
    ];

    for (let percent = 0; percent <= 100; percent += 2) {
        setText("charge-percent", `${percent}%`);
        setWidth("charge-progress-fill", percent);

        $("charge-progress")?.setAttribute(
            "aria-valuenow",
            String(percent)
        );

        const index = Math.min(
            statusMessages.length - 1,
            Math.floor(percent / 21)
        );

        setText("charge-status", statusMessages[index]);

        await sleep(70);
    }

    await sleep(500);

    goToScreen("blink-screen");

    if (button) {
        button.disabled = false;
        button.textContent = "⚡ Charge Brain";
    }

    state.chargeStarted = false;
}

$("charge-button")?.addEventListener("click", chargeBrain);

/* -------------------- STAGE 3: REAL BLINK DETECTION -------------------- */

/*
   Uses MediaPipe Face Mesh through a browser CDN.
   Camera permission is required.
   If the model or camera cannot load, the app explains the problem.
   It does NOT automatically count blinks based on elapsed time.
*/

function loadExternalScript(src) {
    return new Promise((resolve, reject) => {
        const existing = [...document.scripts].find(
            (script) => script.src === src
        );

        if (existing) {
            if (existing.dataset.loaded === "true") {
                resolve();
                return;
            }

            existing.addEventListener("load", () => resolve(), { once: true });
            existing.addEventListener("error", () => reject(new Error("Script failed")), { once: true });
            return;
        }

        const script = document.createElement("script");
        script.src = src;
        script.async = true;

        script.onload = () => {
            script.dataset.loaded = "true";
            resolve();
        };

        script.onerror = () => reject(new Error("Could not load camera model"));

        document.head.appendChild(script);
    });
}

function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function calculateEyeAspectRatio(landmarks, indices) {
    const p = indices.map((index) => landmarks[index]);

    const verticalOne = distance(p[1], p[5]);
    const verticalTwo = distance(p[2], p[4]);
    const horizontal = distance(p[0], p[3]);

    if (horizontal === 0) return 1;

    return (verticalOne + verticalTwo) / (2 * horizontal);
}

function handleFaceResults(results) {
    if (!state.blinkDetectionRunning) return;

    const faces = results.multiFaceLandmarks;

    if (!faces || !faces.length) {
        setStatus("blink-status", "POSITION FACE IN FRAME");
        return;
    }

    setStatus("blink-status", "BLINK DETECTION ACTIVE");

    const landmarks = faces[0];

    // MediaPipe Face Mesh eye landmark indices.
    const leftEye = [33, 160, 158, 133, 153, 144];
    const rightEye = [362, 385, 387, 263, 373, 380];

    const leftEAR = calculateEyeAspectRatio(landmarks, leftEye);
    const rightEAR = calculateEyeAspectRatio(landmarks, rightEye);

    const ear = (leftEAR + rightEAR) / 2;

    const now = Date.now();

    // Thresholds may need calibration for different faces/cameras.
    if (ear < 0.19) {
        state.eyeClosedFrames++;
        state.eyeOpenFrames = 0;

        if (state.eyeClosedFrames >= 2) {
            state.previousEyeState = "closed";
        }

        return;
    }

    if (ear > 0.23) {
        state.eyeOpenFrames++;

        if (
            state.previousEyeState === "closed" &&
            state.eyeOpenFrames >= 2 &&
            now - state.lastBlinkTime > 250
        ) {
            state.blinkCount++;
            state.lastBlinkTime = now;
            state.previousEyeState = "open";
            state.eyeClosedFrames = 0;
            state.eyeOpenFrames = 0;

            setText("blink-count", state.blinkCount);
            setWidth("blink-progress-fill", state.blinkCount * 10);

            if (state.blinkCount >= 10) {
                completeBlinkTest();
            }
        } else if (state.eyeOpenFrames >= 2) {
            state.previousEyeState = "open";
            state.eyeClosedFrames = 0;
        }
    }
}

async function startBlinkTest() {
    if (state.blinkDetectionRunning) return;

    setText("blink-error", "");

    if (!navigator.mediaDevices?.getUserMedia) {
        setText(
            "blink-error",
            "Camera access is unavailable. Use HTTPS or localhost in a supported browser."
        );
        return;
    }

    const button = $("start-blink-button");

    if (button) {
        button.disabled = true;
        button.textContent = "Loading camera...";
    }

    try {
        await loadExternalScript(
            "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js"
        );

        if (typeof window.FaceMesh !== "function") {
            throw new Error("Face detection model did not initialize.");
        }

        state.cameraStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: "user",
                width: { ideal: 640 },
                height: { ideal: 480 }
            },
            audio: false
        });

        const video = $("blink-video");

        video.srcObject = state.cameraStream;
        await video.play();

        hide("blink-camera-placeholder");

        state.blinkCount = 0;
        state.eyeClosedFrames = 0;
        state.eyeOpenFrames = 0;
        state.previousEyeState = "open";
        state.lastBlinkTime = 0;

        setText("blink-count", "0");
        setWidth("blink-progress-fill", 0);

        const faceMesh = new window.FaceMesh({
            locateFile: (file) =>
                `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
        });

        faceMesh.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true,
            minDetectionConfidence: 0.55,
            minTrackingConfidence: 0.55
        });

        faceMesh.onResults(handleFaceResults);

        state.faceMesh = faceMesh;
        state.blinkDetectionRunning = true;

        if (button) {
            button.disabled = false;
            button.textContent = "Restart Blink Test";
        }

        setStatus("blink-status", "BLINK DETECTION ACTIVE");

        taxiTalk("Camera connected. Ten actual blinks, please. I am watching the paperwork.");
        processBlinkFrames();

    } catch (error) {
        console.error("Blink test error:", error);

        stopBlinkCamera();

        setText(
            "blink-error",
            "Camera/model unavailable. Allow camera permission, use HTTPS or localhost, and check your internet connection. Please try again."
        );

        setStatus("blink-status", "CAMERA ERROR");

        if (button) {
            button.disabled = false;
            button.textContent = "📷 Try Blink Test Again";
        }
    }
}

async function processBlinkFrames() {
    while (
        state.blinkDetectionRunning &&
        state.faceMesh &&
        $("blink-video")?.readyState >= 2
    ) {
        try {
            await state.faceMesh.send({
                image: $("blink-video")
            });
        } catch (error) {
            console.warn("Face tracking frame error:", error);
        }

        await sleep(80);
    }
}

function completeBlinkTest() {
    if (state.blinkTestPassed) return;

    state.blinkTestPassed = true;

    setStatus("blink-status", "10 BLINKS VERIFIED");
    setWidth("blink-progress-fill", 100);

    stopBlinkCamera();

    taxiTalk("Ten blinks verified. Finally, some eye-opening performance.");

    managedTimeout(() => {
        goToScreen("countdown-screen");
    }, 1000);
}

$("start-blink-button")?.addEventListener("click", startBlinkTest);

/* -------------------- STAGE 4: COUNTDOWN -------------------- */

let countdownRunning = false;

async function startMainCountdown() {
    if (countdownRunning) return;

    countdownRunning = true;

    const button = $("countdown-start-button");
    if (button) button.disabled = true;

    for (let number = 10; number >= 1; number--) {
        setText("countdown-number", number);
        setText("countdown-status", "The department is preparing your case...");

        if (number === 10 || number === 5 || number === 3 || number === 1) {
            speak(String(number));
        }

        await sleep(1000);
    }

    setText("countdown-number", "GO!");
    setText("countdown-status", "Your question department has arrived.");

    await sleep(700);

    countdownRunning = false;

    if (button) button.disabled = false;

    state.fakeQuestionCount = 0;
    goToScreen("fake-question-screen");
    startFakeQuestion();
}

$("countdown-start-button")?.addEventListener("click", startMainCountdown);

/* -------------------- STAGE 5: FAKE QUESTION PRANK -------------------- */

let fakeQuestionRunning = false;

const fakeQuestionRoasts = [
    "Time's up! You failed to answer absolutely nothing.",
    "Your answer has been rejected because the question was never issued.",
    "Please contact the Department of Missing Questions.",
    "The question has left the chat. Your time has not.",
    "Excellent. You have completed a test with zero questions.",
    "Your response is pending because the question is on annual leave."
];

async function startFakeQuestion() {
    if (fakeQuestionRunning) return;

    fakeQuestionRunning = true;

    state.fakeQuestionCount++;

    setText("fake-question-timer", "15");
    setWidth("fake-question-progress", 100);

    setFeedback(
        "fake-question-feedback",
        "The question is missing. The deadline is not."
    );

    hide("fake-question-next-button");

    const fakeTaxi = randomItem([
        "Where is the question? Where is the riddle? Don't ask me. I'm just the tax department!",
        "I would show you the question, but it appears to be taxable information.",
        "The department assures me that a question existed emotionally.",
        "Please answer confidently. Accuracy is not our priority here."
    ]);

    setText("fake-taxi-message", fakeTaxi);
    taxiTalk(fakeTaxi, true, "shocked");

    // Intentionally no real question and no answer options.
    for (let seconds = 15; seconds >= 1; seconds--) {
        setText("fake-question-timer", seconds);
        setWidth("fake-question-progress", (seconds / 15) * 100);

        await sleep(1000);
    }

    setText("fake-question-timer", "0");
    setWidth("fake-question-progress", 0);

    setFeedback(
        "fake-question-feedback",
        randomItem(fakeQuestionRoasts)
    );

    setText(
        "fake-taxi-message",
        "The question was missing, but your deadline was punctual. Outstanding administration!"
    );

    show("fake-question-next-button");

    fakeQuestionRunning = false;

    taxiTalk(randomItem(fakeQuestionRoasts), true, "laugh");
}

$("fake-question-next-button")?.addEventListener("click", () => {
    goToScreen("captcha-screen");
    generateCaptcha();
});

/* -------------------- STAGE 6: NUMERIC-ONLY CAPTCHA -------------------- */

let captchaCode = "";

function generateCaptcha() {
    const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let result = "";

    for (let i = 0; i < 8; i++) {
        result += characters[Math.floor(Math.random() * characters.length)];
    }

    // Ensure the CAPTCHA contains at least one digit.
    if (!/\d/.test(result)) {
        result = result.slice(0, 7) + String(Math.floor(Math.random() * 10));
    }

    captchaCode = result;

    setText("captcha-code", captchaCode);
    setFeedback("captcha-feedback", "");

    const input = $("captcha-input");

    if (input) {
        input.value = "";
        input.focus();
    }
}

$("captcha-input")?.addEventListener("input", (event) => {
    event.target.value = event.target.value.replace(/\D/g, "");
});

$("captcha-refresh-button")?.addEventListener("click", generateCaptcha);

$("captcha-form")?.addEventListener("submit", (event) => {
    event.preventDefault();

    const enteredDigits = $("captcha-input")?.value.trim() || "";
    const expectedDigits = captchaCode.replace(/\D/g, "");

    if (!expectedDigits) {
        setFeedback(
            "captcha-feedback",
            "This code contains no digits. Refresh the CAPTCHA.",
            "incorrect"
        );
        return;
    }

    if (enteredDigits !== expectedDigits) {
        setFeedback(
            "captcha-feedback",
            "Incorrect digits. The CAPTCHA stays the same. Try again!",
            "incorrect"
        );

        taxiTalk("Incorrect. The digits were right there. The department is disappointed.", true, "disappointed");

        $("captcha-input")?.focus();
        return;
    }

    setFeedback(
        "captcha-feedback",
        "Verified! Your unnecessary paperwork continues.",
        "correct"
    );

    taxiTalk("CAPTCHA verified. Your freedom has been delayed successfully.");

    managedTimeout(() => {
        startRealQuestionRound();
    }, 800);
});

/* -------------------- STAGE 7: REAL QUESTION BANK -------------------- */

/*
   Every entry below is a real question with four options.
   Fake-question prank is handled separately in Stage 5.
*/

const questionBank = [
    {
        id: 1, category: "RIDDLE",
        question: "What has keys but cannot open locks?",
        options: ["A piano", "A treasure chest", "A door", "A map"],
        answer: 0
    },
    {
        id: 2, category: "LOGIC",
        question: "What comes next: 2, 4, 8, 16, ...?",
        options: ["18", "24", "32", "30"],
        answer: 2
    },
    {
        id: 3, category: "COMPUTER SCIENCE",
        question: "Which language is primarily used to structure a web page?",
        options: ["HTML", "SQL", "Python", "C"],
        answer: 0
    },
    {
        id: 4, category: "RIDDLE",
        question: "What gets wetter the more it dries?",
        options: ["A towel", "A sponge", "A cloud", "A river"],
        answer: 0
    },
    {
        id: 5, category: "MATHS",
        question: "What is 12 × 8?",
        options: ["86", "96", "108", "92"],
        answer: 1
    },
    {
        id: 6, category: "LOGIC",
        question: "How many months have 28 days?",
        options: ["One", "Two", "Six", "All twelve"],
        answer: 3
    },
    {
        id: 7, category: "COMPUTER SCIENCE",
        question: "Which data structure follows FIFO?",
        options: ["Stack", "Queue", "Tree", "Graph"],
        answer: 1
    },
    {
        id: 8, category: "RIDDLE",
        question: "What has a neck but no head?",
        options: ["A bottle", "A snake", "A shirt", "A statue"],
        answer: 0
    },
    {
        id: 9, category: "MATHS",
        question: "What is half of 50 plus 10?",
        options: ["15", "25", "35", "30"],
        answer: 2
    },
    {
        id: 10, category: "COMPUTER SCIENCE",
        question: "Which one is a programming language?",
        options: ["Python", "HTTP", "HTML", "USB"],
        answer: 0
    },
    {
        id: 11, category: "RIDDLE",
        question: "What has one eye but cannot see?",
        options: ["A needle", "A camera", "A storm", "A potato"],
        answer: 0
    },
    {
        id: 12, category: "MATHS",
        question: "What is the square of 9?",
        options: ["18", "72", "81", "99"],
        answer: 2
    },
    {
        id: 13, category: "LOGIC",
        question: "If you overtake the person in second place, which position are you in?",
        options: ["First", "Second", "Third", "Last"],
        answer: 1
    },
    {
        id: 14, category: "COMPUTER SCIENCE",
        question: "Which part of a computer performs most general calculations?",
        options: ["CPU", "Monitor", "Keyboard", "Mouse"],
        answer: 0
    },
    {
        id: 15, category: "RIDDLE",
        question: "What can travel around the world while staying in one corner?",
        options: ["A stamp", "A plane", "A compass", "A shadow"],
        answer: 0
    },
    {
        id: 16, category: "MATHS",
        question: "What is 100 divided by 4?",
        options: ["20", "25", "40", "50"],
        answer: 1
    },
    {
        id: 17, category: "COMPUTER SCIENCE",
        question: "What does CPU stand for?",
        options: [
            "Central Processing Unit",
            "Computer Personal Unit",
            "Central Program Utility",
            "Control Power Unit"
        ],
        answer: 0
    },
    {
        id: 18, category: "RIDDLE",
        question: "What has hands but cannot clap?",
        options: ["A clock", "A robot", "A statue", "A tree"],
        answer: 0
    },
    {
        id: 19, category: "MATHS",
        question: "What is 15 + 27?",
        options: ["32", "42", "40", "52"],
        answer: 1
    },
    {
        id: 20, category: "LOGIC",
        question: "Which number does not belong: 2, 4, 6, 9, 10?",
        options: ["2", "6", "9", "10"],
        answer: 2
    },
    {
        id: 21, category: "COMPUTER SCIENCE",
        question: "Which symbol commonly starts a single-line comment in JavaScript?",
        options: ["//", "##", "<!--", "**"],
        answer: 0
    },
    {
        id: 22, category: "RIDDLE",
        question: "What has many teeth but cannot bite?",
        options: ["A comb", "A tiger", "A zipperless bag", "A shark"],
        answer: 0
    },
    {
        id: 23, category: "MATHS",
        question: "What is 7 squared?",
        options: ["14", "42", "49", "56"],
        answer: 2
    },
    {
        id: 24, category: "LOGIC",
        question: "A farmer has 10 sheep. All but 3 run away. How many remain?",
        options: ["3", "7", "10", "0"],
        answer: 0
    },
    {
        id: 25, category: "COMPUTER SCIENCE",
        question: "Which structure follows LIFO?",
        options: ["Queue", "Stack", "Array", "Linked list"],
        answer: 1
    },
    {
        id: 26, category: "RIDDLE",
        question: "What has cities but no houses, and rivers but no water?",
        options: ["A map", "A painting", "A globe with oceans", "A book"],
        answer: 0
    },
    {
        id: 27, category: "MATHS",
        question: "What is 144 divided by 12?",
        options: ["10", "11", "12", "14"],
        answer: 2
    },
    {
        id: 28, category: "COMPUTER SCIENCE",
        question: "Which one is a web browser?",
        options: ["Chrome", "Java", "Linux", "Git"],
        answer: 0
    },
    {
        id: 29, category: "RIDDLE",
        question: "What goes up but never comes down?",
        options: ["Your age", "A balloon", "A rocket", "An elevator"],
        answer: 0
    },
    {
        id: 30, category: "MATHS",
        question: "What is 9 × 9?",
        options: ["72", "81", "90", "99"],
        answer: 1
    },
    {
        id: 31, category: "COMPUTER SCIENCE",
        question: "Which HTML element creates a hyperlink?",
        options: ["<a>", "<p>", "<div>", "<img>"],
        answer: 0
    },
    {
        id: 32, category: "LOGIC",
        question: "If yesterday was Monday, what day is tomorrow?",
        options: ["Tuesday", "Wednesday", "Thursday", "Sunday"],
        answer: 1
    },
    {
        id: 33, category: "RIDDLE",
        question: "What has four legs but cannot walk?",
        options: ["A table", "A dog", "A horse", "A cat"],
        answer: 0
    },
    {
        id: 34, category: "MATHS",
        question: "What is 20% of 200?",
        options: ["20", "30", "40", "50"],
        answer: 2
    },
    {
        id: 35, category: "COMPUTER SCIENCE",
        question: "Which command is commonly used to copy a Git repository?",
        options: ["git clone", "git delete", "git paint", "git sleep"],
        answer: 0
    },
    {
        id: 36, category: "RIDDLE",
        question: "What has words but never speaks?",
        options: ["A book", "A microphone", "A person", "A radio"],
        answer: 0
    },
    {
        id: 37, category: "MATHS",
        question: "What is 3 cubed?",
        options: ["6", "9", "18", "27"],
        answer: 3
    },
    {
        id: 38, category: "LOGIC",
        question: "Which is heavier: one kilogram of iron or one kilogram of cotton?",
        options: ["Iron", "Cotton", "They weigh the same", "Cannot be compared"],
        answer: 2
    },
    {
        id: 39, category: "COMPUTER SCIENCE",
        question: "What does CSS control on a typical web page?",
        options: ["Visual styling", "Database storage", "Internet cables", "Processor speed"],
        answer: 0
    },
    {
        id: 40, category: "RIDDLE",
        question: "What begins with T, ends with T, and has T inside?",
        options: ["A teapot", "A tent", "A ticket", "A tablet"],
        answer: 0
    },
    {
        id: 41, category: "MATHS",
        question: "What is 64 divided by 8?",
        options: ["6", "7", "8", "9"],
        answer: 2
    },
    {
        id: 42, category: "COMPUTER SCIENCE",
        question: "Which keyword declares a constant in JavaScript?",
        options: ["const", "fixed", "constant", "staticOnly"],
        answer: 0
    },
    {
        id: 43, category: "RIDDLE",
        question: "What has a ring but no finger?",
        options: ["A telephone", "A glove", "A hand", "A bracelet"],
        answer: 0
    },
    {
        id: 44, category: "LOGIC",
        question: "You have three apples and take away two. How many do you have?",
        options: ["One", "Two", "Three", "Five"],
        answer: 1
    },
    {
        id: 45, category: "MATHS",
        question: "What is 11 × 11?",
        options: ["111", "121", "101", "131"],
        answer: 1
    },
    {
        id: 46, category: "COMPUTER SCIENCE",
        question: "Which one is an operating system?",
        options: ["Linux", "HTML", "JavaScript", "MySQL"],
        answer: 0
    },
    {
        id: 47, category: "RIDDLE",
        question: "What can you catch but not throw?",
        options: ["A cold", "A ball", "A frisbee", "A stone"],
        answer: 0
    },
    {
        id: 48, category: "MATHS",
        question: "What is 125 + 75?",
        options: ["175", "190", "200", "225"],
        answer: 2
    },
    {
        id: 49, category: "COMPUTER SCIENCE",
        question: "Which data format uses key-value pairs and is common in web APIs?",
        options: ["JSON", "JPEG", "MP3", "PNG"],
        answer: 0
    },
    {
        id: 50, category: "RIDDLE",
        question: "What has branches but no leaves, trunk, or fruit?",
        options: ["A bank", "A tree", "A forest", "A garden"],
        answer: 0
    },
    {
        id: 51, category: "MATHS",
        question: "What is 18 + 24?",
        options: ["40", "42", "44", "46"],
        answer: 1
    },
    {
        id: 52, category: "COMPUTER SCIENCE",
        question: "What does URL identify?",
        options: ["A resource location", "A CPU core", "A password type", "A file compression method"],
        answer: 0
    },
    {
        id: 53, category: "RIDDLE",
        question: "What has a head and a tail but no body?",
        options: ["A coin", "A snake", "A kite", "A comet"],
        answer: 0
    },
    {
        id: 54, category: "MATHS",
        question: "What is 5 factorial?",
        options: ["25", "60", "100", "120"],
        answer: 3
    },
    {
        id: 55, category: "LOGIC",
        question: "How many times can you subtract 5 from 25?",
        options: ["Once", "Five times", "Four times", "Twenty-five times"],
        answer: 0
    },
    {
        id: 56, category: "COMPUTER SCIENCE",
        question: "Which database language is used to query relational tables?",
        options: ["SQL", "CSS", "SVG", "Bash only"],
        answer: 0
    },
    {
        id: 57, category: "RIDDLE",
        question: "What has a thumb and four fingers but is not alive?",
        options: ["A glove", "A monkey", "A hand", "A robot"],
        answer: 0
    },
    {
        id: 58, category: "MATHS",
        question: "What is 30% of 90?",
        options: ["18", "27", "30", "36"],
        answer: 1
    },
    {
        id: 59, category: "COMPUTER SCIENCE",
        question: "Which operator checks strict equality in JavaScript?",
        options: ["===", "=", "!=", "=>"],
        answer: 0
    },
    {
        id: 60, category: "RIDDLE",
        question: "What has an end but no beginning?",
        options: ["A stick", "A circle", "A loop", "A ring"],
        answer: 0
    },
    {
        id: 61, category: "MATHS",
        question: "What is the square root of 169?",
        options: ["11", "12", "13", "14"],
        answer: 2
    },
    {
        id: 62, category: "COMPUTER SCIENCE",
        question: "Which HTML element displays an image?",
        options: ["<img>", "<image-text>", "<picture-file>", "<src>"],
        answer: 0
    },
    {
        id: 63, category: "RIDDLE",
        question: "What has ears but cannot hear?",
        options: ["Corn", "A rabbit", "A dog", "A person"],
        answer: 0
    },
    {
        id: 64, category: "LOGIC",
        question: "A rooster lays an egg on a roof. Which side does it roll down?",
        options: ["Left", "Right", "Neither", "Roosters do not lay eggs"],
        answer: 3
    },
    {
        id: 65, category: "MATHS",
        question: "What is 7 × 12?",
        options: ["72", "84", "96", "82"],
        answer: 1
    },
    {
        id: 66, category: "COMPUTER SCIENCE",
        question: "Which Git command shows the current working-tree status?",
        options: ["git status", "git breakfast", "git webpage", "git camera"],
        answer: 0
    },
    {
        id: 67, category: "RIDDLE",
        question: "What has a bed but never sleeps?",
        options: ["A river", "A person", "A cat", "A hotel guest"],
        answer: 0
    },
    {
        id: 68, category: "MATHS",
        question: "What is 250 divided by 5?",
        options: ["25", "40", "50", "55"],
        answer: 2
    },
    {
        id: 69, category: "COMPUTER SCIENCE",
        question: "What is the main purpose of a database?",
        options: ["Organize and store data", "Cool a CPU", "Draw web icons", "Increase screen brightness"],
        answer: 0
    },
    {
        id: 70, category: "RIDDLE",
        question: "What has a spine but no bones?",
        options: ["A book", "A fish", "A human", "A skeleton"],
        answer: 0
    },
    {
        id: 71, category: "MATHS",
        question: "What is 14 × 3?",
        options: ["32", "42", "44", "48"],
        answer: 1
    },
    {
        id: 72, category: "COMPUTER SCIENCE",
        question: "Which protocol commonly secures websites?",
        options: ["HTTPS", "FTP only", "ASCII", "PNG"],
        answer: 0
    },
    {
        id: 73, category: "RIDDLE",
        question: "What has legs but does not walk, and a top but no head?",
        options: ["A table", "A bird", "A horse", "A person"],
        answer: 0
    },
    {
        id: 74, category: "MATHS",
        question: "What is 1,000 minus 375?",
        options: ["625", "635", "675", "725"],
        answer: 0
    },
    {
        id: 75, category: "COMPUTER SCIENCE",
        question: "Which symbol is commonly used to access an object's property in JavaScript?",
        options: [".", "#", "@@", "~>"],
        answer: 0
    },
    {
        id: 76, category: "RIDDLE",
        question: "What has a face and two hands but no arms or legs?",
        options: ["A clock", "A doll", "A robot", "A painting"],
        answer: 0
    },
    {
        id: 77, category: "MATHS",
        question: "What is 16 squared?",
        options: ["128", "196", "256", "264"],
        answer: 2
    },
    {
        id: 78, category: "COMPUTER SCIENCE",
        question: "Which of these is a common frontend JavaScript framework?",
        options: ["React", "PostgreSQL", "Nginx", "SQLite"],
        answer: 0
    },
    {
        id: 79, category: "RIDDLE",
        question: "What kind of room has no doors or windows?",
        options: ["A mushroom", "A bedroom", "A classroom", "A living room"],
        answer: 0
    },
    {
        id: 80, category: "MATHS",
        question: "What is 45 divided by 9?",
        options: ["4", "5", "6", "9"],
        answer: 1
    },
    {
        id: 81, category: "COMPUTER SCIENCE",
        question: "What does API stand for?",
        options: [
            "Application Programming Interface",
            "Automated Program Internet",
            "Applied Processor Input",
            "Application Page Index"
        ],
        answer: 0
    },
    {
        id: 82, category: "RIDDLE",
        question: "What has no life but can die?",
        options: ["A battery", "A rock", "A table", "A cup"],
        answer: 0
    },
    {
        id: 83, category: "MATHS",
        question: "What is 2 to the power of 5?",
        options: ["10", "16", "32", "64"],
        answer: 2
    },
    {
        id: 84, category: "LOGIC",
        question: "Which word is spelled incorrectly in every dictionary?",
        options: ["Incorrectly", "Dictionary", "Wrong", "Misspelled"],
        answer: 0
    },
    {
        id: 85, category: "COMPUTER SCIENCE",
        question: "Which device is primarily used to move a pointer on a desktop computer?",
        options: ["Mouse", "Printer", "Speaker", "Router"],
        answer: 0
    },
    {
        id: 86, category: "RIDDLE",
        question: "What has many needles but does not sew?",
        options: ["A pine tree", "A sewing machine", "A tailor", "A cactus-free garden"],
        answer: 0
    },
    {
        id: 87, category: "MATHS",
        question: "What is 81 divided by 9?",
        options: ["7", "8", "9", "10"],
        answer: 2
    },
    {
        id: 88, category: "COMPUTER SCIENCE",
        question: "Which is commonly used to style text colour on a webpage?",
        options: ["CSS", "SQL", "Git", "DNS"],
        answer: 0
    },
    {
        id: 89, category: "RIDDLE",
        question: "What can fill a room but takes up no space?",
        options: ["Light", "Furniture", "Water", "A chair"],
        answer: 0
    },
    {
        id: 90, category: "MATHS",
        question: "What is 13 + 29?",
        options: ["40", "41", "42", "43"],
        answer: 2
    },
    {
        id: 91, category: "COMPUTER SCIENCE",
        question: "What is the purpose of a loop in programming?",
        options: [
            "Repeat instructions",
            "Permanently delete a keyboard",
            "Turn code into a monitor",
            "Increase internet speed automatically"
        ],
        answer: 0
    },
    {
        id: 92, category: "RIDDLE",
        question: "What has a mouth but cannot eat?",
        options: ["A river", "A person", "A baby", "A dog"],
        answer: 0
    },
    {
        id: 93, category: "MATHS",
        question: "What is 6 × 7?",
        options: ["36", "40", "42", "48"],
        answer: 2
    },
    {
        id: 94, category: "LOGIC",
        question: "There are 5 birds on a branch. Two fly away. How many remain on the branch?",
        options: ["2", "3", "5", "0"],
        answer: 1
    },
    {
        id: 95, category: "COMPUTER SCIENCE",
        question: "Which file extension is commonly used for JavaScript files?",
        options: [".js", ".css", ".jpg", ".sql"],
        answer: 0
    },
    {
        id: 96, category: "RIDDLE",
        question: "What has a bottom at the top?",
        options: ["Your legs", "A mountain", "A cloud", "A roof"],
        answer: 0
    },
    {
        id: 97, category: "MATHS",
        question: "What is 225 divided by 15?",
        options: ["12", "15", "18", "25"],
        answer: 1
    },
    {
        id: 98, category: "COMPUTER SCIENCE",
        question: "What does RAM mainly provide to a computer?",
        options: [
            "Temporary working memory",
            "Permanent paper storage",
            "Internet access by itself",
            "A physical keyboard"
        ],
        answer: 0
    },
    {
        id: 99, category: "RIDDLE",
        question: "What has no beginning, end, or corners?",
        options: ["A circle", "A square", "A triangle", "A line segment"],
        answer: 0
    },
    {
        id: 100, category: "MATHS",
        question: "What is 17 + 18?",
        options: ["33", "34", "35", "36"],
        answer: 2
    }
];

/* -------------------- QUESTION ROUND -------------------- */

function chooseQuestions() {
    return shuffle(questionBank).slice(0, 3);
}

async function startRealQuestionRound() {
    state.currentQuestionIndex = 0;
    state.questionSet = chooseQuestions();

    goToScreen("real-question-screen");

    await showQuestionWithPreparation();
}

async function showQuestionWithPreparation() {
    if (state.currentQuestionIndex >= state.questionSet.length) {
        finishQuestionRound();
        return;
    }

    state.questionAnswered = false;

    const question = state.questionSet[state.currentQuestionIndex];

    state.currentQuestion = question;

    hide("real-question-content");
    show("question-prep-panel");

    setText(
        "question-prep-message",
        "Do not panic. Panic is taxable."
    );

    for (let seconds = 10; seconds >= 1; seconds--) {
        setText("question-prep-countdown", seconds);
        setWidth("question-prep-progress", (seconds / 10) * 100);

        if (seconds === 10 || seconds === 5 || seconds === 3 || seconds === 1) {
            speak(String(seconds));
        }

        await sleep(1000);
    }

    setText("question-prep-countdown", "GO!");
    setWidth("question-prep-progress", 0);

    await sleep(400);

    hide("question-prep-panel");
    show("real-question-content");

    displayRealQuestion(question);
}

function displayRealQuestion(question) {
    state.questionAnswered = false;

    setText(
        "question-number",
        `QUESTION ${state.currentQuestionIndex + 1} / ${state.questionSet.length}`
    );

    setText("question-category", question.category);
    setText("real-question-text", question.question);

    setFeedback("real-question-feedback", "");
    hide("real-question-next-button");

    const optionsContainer = $("real-question-options");
    if (!optionsContainer) return;

    optionsContainer.replaceChildren();

    const labels = ["A", "B", "C", "D"];

    question.options.forEach((option, index) => {
        const button = document.createElement("button");

        button.type = "button";
        button.className = "option-button";

        const letter = document.createElement("span");
        letter.className = "option-letter";
        letter.textContent = labels[index];

        const text = document.createElement("span");
        text.textContent = option;

        button.append(letter, text);

        button.addEventListener("click", () => {
            submitQuestionAnswer(index);
        });

        optionsContainer.appendChild(button);
    });

    startAnswerTimer();
}

let answerTimerGeneration = 0;

function startAnswerTimer() {
    const generation = ++answerTimerGeneration;

    let remaining = 15;

    setText("real-question-timer", remaining);
    setWidth("real-question-progress", 100);

    const interval = managedInterval(() => {
        if (generation !== answerTimerGeneration) return;

        remaining--;

        setText("real-question-timer", remaining);
        setWidth("real-question-progress", (remaining / 15) * 100);

        if (remaining <= 0) {
            clearInterval(interval);
            state.intervals.delete(interval);

            if (!state.questionAnswered) {
                handleQuestionTimeout();
            }
        }
    }, 1000);
}

function lockQuestionOptions() {
    document.querySelectorAll("#real-question-options button").forEach((button) => {
        button.disabled = true;
    });
}

function submitQuestionAnswer(selectedIndex) {
    if (state.questionAnswered) return;

    state.questionAnswered = true;
    answerTimerGeneration++;

    lockQuestionOptions();

    const question = state.currentQuestion;
    const correct = selectedIndex === question.answer;

    const buttons = [
        ...document.querySelectorAll("#real-question-options .option-button")
    ];

    buttons[question.answer]?.classList.add("correct");

    if (correct) {
        state.correct++;

        setFeedback(
            "real-question-feedback",
            "Correct! Your neurons have avoided taxation for 0.4 seconds.",
            "correct"
        );

        taxiTalk("Correct answer! Very suspicious. Intelligence above the exemption limit!", true, "shocked");
    } else {
        state.incorrect++;

        buttons[selectedIndex]?.classList.add("incorrect");

        setFeedback(
            "real-question-feedback",
            `Incorrect! The correct answer is ${question.options[question.answer]}.`,
            "incorrect"
        );

        taxiTalk("Wrong answer! Even my budget calculator is angry. Report to Brain Maintenance!", true, "angry");
    }

    finishCurrentQuestion();
}

function handleQuestionTimeout() {
    if (state.questionAnswered) return;

    state.questionAnswered = true;
    state.timedOut++;

    answerTimerGeneration++;

    lockQuestionOptions();

    const question = state.currentQuestion;

    document.querySelectorAll("#real-question-options .option-button")
        .forEach((button, index) => {
            if (index === question.answer) {
                button.classList.add("correct");
            }
        });

    setFeedback(
        "real-question-feedback",
        `Time's up! The correct answer was ${question.options[question.answer]}.`,
        "incorrect"
    );

    taxiTalk("Time is up. Your answer appears to be stuck in traffic.", true, "disappointed");

    finishCurrentQuestion();
}

function finishCurrentQuestion() {
    const button = $("real-question-next-button");

    if (!button) return;

    button.textContent =
        state.currentQuestionIndex === state.questionSet.length - 1
            ? "See My Tax Bill →"
            : "Next Question →";

    show("real-question-next-button");
}

$("real-question-next-button")?.addEventListener("click", async () => {
    if (!state.questionAnswered) return;

    state.currentQuestionIndex++;

    await showQuestionWithPreparation();
});

function finishQuestionRound() {
    goToScreen("tax-wheel-screen");

    taxiTalk(
        `Assessment complete. ${state.correct} correct, ${state.incorrect} incorrect, and ${state.timedOut} timed out. The department is delighted.`
    );
}

/* -------------------- STAGE 8: TAX WHEEL -------------------- */

const taxSegments = [
    "Tax on breathing",
    "GST on brain cells",
    "Processing fee for existing",
    "Convenience fee for convenience",
    "Surcharge on common sense",
    "Administrative fee for blinking",
    "Luxury tax on dreams",
    "Tax on searching for free",
    "Neuron maintenance charge",
    "Fee for questioning the fee",
    "Cess on your patience",
    "Refund postponed indefinitely",
    "Application fee for a refund",
    "Overthinking surcharge",
    "Tax on unnecessary confidence",
    "Emotional processing fee"
];

function prepareWheel() {
    const wheel = $("tax-wheel");
    if (!wheel) return;

    const colors = [
        "#438cff",
        "#7659ff",
        "#243c80",
        "#9a63ff",
        "#306de0",
        "#6840cf",
        "#2652a8",
        "#8752e9",
        "#3874c7",
        "#5735ad",
        "#2456a5",
        "#7953d9",
        "#3261b8",
        "#8c55df",
        "#2d70b7",
        "#623bbd"
    ];

    const segmentSize = 360 / taxSegments.length;

    const gradient = taxSegments.map((_, index) => {
        const start = index * segmentSize;
        const end = (index + 1) * segmentSize;

        return `${colors[index % colors.length]} ${start}deg ${end}deg`;
    }).join(", ");

    wheel.style.background = `conic-gradient(${gradient})`;
}

function spinTaxWheel() {
    if (state.wheelSpinning) return;

    state.wheelSpinning = true;
    taxiTalk("Round and round! The only thing this wheel never lands on is a refund.", true, "laugh");

    const button = $("spin-wheel-button");
    const wheel = $("tax-wheel");

    if (button) {
        button.disabled = true;
        button.textContent = "🎡 Calculating your suffering...";
    }

    hide("tax-wheel-next-button");

    const winningIndex = Math.floor(Math.random() * taxSegments.length);
    const segmentSize = 360 / taxSegments.length;

    /*
       The pointer is at the top (0 degrees).
       Calculate the wheel rotation so the selected segment's
       centre ends under the pointer.
    */
    const segmentCenter = (winningIndex + 0.5) * segmentSize;
    const desiredAngle = (360 - segmentCenter) % 360;

    const fullRotations = 360 * (5 + Math.floor(Math.random() * 3));
    const rotation = fullRotations + desiredAngle;

    wheel.style.transition = "none";
    wheel.style.transform = "rotate(0deg)";

    // Force browser to apply the reset before spinning.
    void wheel.offsetWidth;

    wheel.style.transition = "transform 5s cubic-bezier(0.12, 0.72, 0.12, 1)";
    wheel.style.transform = `rotate(${rotation}deg)`;

    setText("tax-wheel-result", "The department is consulting the wheel...");

    managedTimeout(() => {
        state.taxResult = taxSegments[winningIndex];
        state.wheelSpinning = false;

        setText("tax-wheel-result", `YOUR TAX: ${state.taxResult}`);

        if (button) {
            button.disabled = false;
            button.textContent = "Spin Again";
        }

        setText("final-tax-result", state.taxResult);

        show("tax-wheel-next-button");

        taxiTalk(`The wheel has spoken. Your new tax is ${state.taxResult}. No appeals allowed.`, true, "laugh");

    }, 5200);
}

$("spin-wheel-button")?.addEventListener("click", spinTaxWheel);

$("tax-wheel-next-button")?.addEventListener("click", () => {
    goToScreen("nose-scan-screen");
});

/* -------------------- STAGE 9: NOSE SCAN -------------------- */

async function startNoseScan() {
    const button = $("start-nose-scan-button");

    if (button) {
        button.disabled = true;
        button.textContent = "Initializing scanner...";
    }

    setText("nose-scan-status", "INITIALIZING");

    setText(
        "nose-scan-message",
        "Requesting camera permission for a theatrical scan..."
    );

    setWidth("nose-scan-progress", 0);

    let cameraAvailable = false;

    try {
        if (navigator.mediaDevices?.getUserMedia) {
            state.noseStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: "user",
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                },
                audio: false
            });

            const video = $("nose-video");
            video.srcObject = state.noseStream;

            await video.play();

            hide("nose-camera-placeholder");

            cameraAvailable = true;
        }
    } catch (error) {
        console.warn("Nose scan camera unavailable:", error);

        setText(
            "nose-scan-message",
            "Camera unavailable. Continuing with the theatrical scanner."
        );
    }

    const stages = [
        "Calibrating nose coordinates...",
        "Scanning imaginary tax particles...",
        "Measuring suspicious confidence...",
        "Consulting the Department of Noses...",
        "Scan complete. Your nose is taxable."
    ];

    for (let i = 0; i < stages.length; i++) {
        setText("nose-scan-status", `SCANNING ${Math.round(((i + 1) / stages.length) * 100)}%`);
        setText("nose-scan-message", stages[i]);
        setWidth("nose-scan-progress", ((i + 1) / stages.length) * 100);

        const marker = $("nose-marker");

        if (marker) {
            marker.style.left = `${35 + Math.random() * 30}%`;
            marker.style.top = `${35 + Math.random() * 30}%`;
        }

        await sleep(850);
    }

    state.noseScanComplete = true;

    stopNoseCamera();

    setText("nose-scan-status", cameraAvailable ? "SCAN COMPLETE" : "SIMULATED SCAN COMPLETE");

    setText(
        "nose-scan-message",
        "Official result: 100% nose, 0% scientific validity. This scan is a joke."
    );

    if (button) {
        button.disabled = false;
        button.textContent = "Scan Complete";
    }

    taxiTalk("Nose scan complete. Your nose has been found guilty of existing.");

    managedTimeout(() => {
        showFinalResults();
    }, 1200);
}

$("start-nose-scan-button")?.addEventListener("click", startNoseScan);

$("skip-nose-scan-button")?.addEventListener("click", () => {
    stopNoseCamera();

    state.noseScanComplete = true;

    setText("nose-scan-status", "SCAN SKIPPED");
    setText("nose-scan-message", "You skipped the scan. The department has noticed.");

    showFinalResults();
});

/* -------------------- STAGE 10: FINAL BETRAYAL -------------------- */

const finalRoasts = [
    "Your brain has been assessed. Your refund has been postponed indefinitely.",
    "You came searching for answers. You found administration.",
    "Your neurons worked hard today. Unfortunately, the department noticed.",
    "Your search was free. Your emotional damage was complimentary.",
    "The department has reviewed your performance and decided to charge you for the review.",
    "Your common sense is temporarily unavailable. Please try again next financial year.",
    "You survived the assessment. Your dignity is still under investigation."
];

function showFinalResults() {
    stopBlinkCamera();
    stopNoseCamera();

    setText("final-search-query", state.searchQuery || "No query recorded");

    setText("final-correct-count", state.correct);
    setText("final-incorrect-count", state.incorrect);
    setText("final-timeout-count", state.timedOut);
    setText("final-prank-count", state.fakeQuestionCount);

    setText(
        "final-tax-result",
        state.taxResult || "Administrative fee for existing"
    );

    setText("final-roast", randomItem(finalRoasts));

    setText(
        "final-taxi-message",
        randomItem(taxiLines)
    );

    goToScreen("final-screen");

    taxiTalk(
        "Congratulations. You have successfully completed the most unnecessary assessment on the internet."
    );
}

/* -------------------- RESTART EVERYTHING -------------------- */

function restartApp() {
    clearAllTimers();
    cancelSpeech();
    cleanupCameras();

    state.searchQuery = "";
    state.chargeStarted = false;
    state.blinkCount = 0;
    state.blinkTestPassed = false;
    state.fakeQuestionCount = 0;

    state.correct = 0;
    state.incorrect = 0;
    state.timedOut = 0;

    state.currentQuestion = null;
    state.currentQuestionIndex = 0;
    state.questionSet = [];
    state.questionAnswered = false;

    state.taxResult = "";
    state.wheelSpinning = false;
    state.noseScanComplete = false;

    state.eyeClosedFrames = 0;
    state.eyeOpenFrames = 0;
    state.previousEyeState = "open";
    state.lastBlinkTime = 0;

    answerTimerGeneration++;
    countdownRunning = false;
    fakeQuestionRunning = false;

    const searchInput = $("search-input");
    if (searchInput) searchInput.value = "";

    setText("charge-percent", "0%");
    setText("charge-status", "Preparing your neurons...");
    setWidth("charge-progress-fill", 0);

    $("charge-progress")?.setAttribute("aria-valuenow", "0");

    setText("blink-count", "0");
    setText("blink-error", "");
    setText("blink-status", "CAMERA NOT STARTED");
    setWidth("blink-progress-fill", 0);

    const blinkButton = $("start-blink-button");
    if (blinkButton) {
        blinkButton.disabled = false;
        blinkButton.textContent = "📷 Start Blink Test";
    }

    setText("countdown-number", "10");
    setText("countdown-status", "Please remain unnecessarily confident.");

    setText("fake-question-timer", "15");
    setWidth("fake-question-progress", 100);
    setFeedback("fake-question-feedback", "");

    hide("fake-question-next-button");

    setText("captcha-code", "A7K3P9B2");
    setText("captcha-feedback", "");

    if ($("captcha-input")) $("captcha-input").value = "";

    hide("real-question-content");
    show("question-prep-panel");

    setText("question-prep-countdown", "10");
    setWidth("question-prep-progress", 100);

    setText("real-question-timer", "15");
    setWidth("real-question-progress", 100);
    setFeedback("real-question-feedback", "");

    hide("real-question-next-button");

    const questionOptions = $("real-question-options");
    if (questionOptions) questionOptions.replaceChildren();

    if ($("tax-wheel")) {
        $("tax-wheel").style.transition = "none";
        $("tax-wheel").style.transform = "rotate(0deg)";
    }

    setText("tax-wheel-result", "Your financial suffering awaits.");

    const wheelButton = $("spin-wheel-button");
    if (wheelButton) {
        wheelButton.disabled = false;
        wheelButton.textContent = "🎡 Spin the Tax Wheel";
    }

    hide("tax-wheel-next-button");

    setText("nose-scan-status", "AWAITING INITIALIZATION");
    setText("nose-scan-message", "This is a theatrical scan, not a real assessment.");
    setWidth("nose-scan-progress", 0);

    const noseButton = $("start-nose-scan-button");
    if (noseButton) {
        noseButton.disabled = false;
        noseButton.textContent = "🔎 Begin Nose Scan";
    }

    goToScreen("home-screen");

    taxiTalk("Welcome back. Your previous financial suffering has been archived.");
}

$("restart-button")?.addEventListener("click", restartApp);

/* -------------------- INITIALIZATION -------------------- */

function initializeApp() {
    screens.forEach((id) => {
        const element = $(id);
        if (!element) return;

        if (id === "home-screen") {
            element.hidden = false;
            element.classList.add("active");
        } else {
            element.hidden = true;
            element.classList.remove("active");
        }
    });

    prepareWheel();

    // Prevent a browser from restoring an old query unexpectedly.
    if ($("search-input")) {
        $("search-input").value = "";
    }

    if ("speechSynthesis" in window) {
        window.speechSynthesis.getVoices();
    }

    console.log(
        "🧠 BRAIN TAX INITIALIZED — The internet is free. Your neurons must pay."
    );
}

document.addEventListener("DOMContentLoaded", initializeApp);