# Shiv Coaching Center — मोबाइल से सेटअप गाइड

यह React + Firebase आधारित शुरुआती प्रोजेक्ट है। वेबसाइट को वास्तविक रूप से चलाने के लिए Firebase Project Configuration और Firestore Rules सेट करना जरूरी है।

## 1. जरूरी बातें
- पूरा कोड मोबाइल ब्राउज़र से GitHub पर अपलोड/एडिट किया जा सकता है।
- किसी भी paid plan या billing को enable न करें।
- Firebase Spark plan की वर्तमान सीमाएँ और उपलब्धता Firebase Console में जाँचें।
- GitHub Pages static frontend host करता है; यह अपने आप Firebase backend नहीं बनाता।

## 2. Firebase सेटअप
1. https://console.firebase.google.com खोलें और नया Project बनाएँ।
2. Spark (no-cost) plan पर रहें।
3. Project Settings > Your apps > Web app में ऐप बनाएँ।
4. Firebase Web Config कॉपी करें।
5. Authentication > Sign-in method में Email/Password enable करें।
6. Firestore Database बनाएँ।
7. `firestore.rules` की सामग्री Firestore Rules में Publish करें।

## 3. Environment variables
प्रोजेक्ट की `.env.example` कॉपी करके `.env` नाम दें और Firebase Web Config के ये मान भरें:
- VITE_FIREBASE_API_KEY
- VITE_FIREBASE_AUTH_DOMAIN
- VITE_FIREBASE_PROJECT_ID
- VITE_FIREBASE_STORAGE_BUCKET
- VITE_FIREBASE_MESSAGING_SENDER_ID
- VITE_FIREBASE_APP_ID

Vite build के लिए ये values build environment में उपलब्ध होनी चाहिए। Firebase Web API config को secret password न समझें; वास्तविक सुरक्षा Firestore Rules से आती है। किसी भी Admin private key को frontend में न डालें।

## 4. पहला Admin बनाना
1. Firebase Authentication में Email/Password से Admin user बनाएँ।
2. उस user का UID कॉपी करें।
3. Firestore में `users` collection बनाएँ।
4. Document ID वही UID रखें।
5. Fields जोड़ें:
   - role: `admin`
   - isActive: `true`
6. अब उसी ईमेल और पासवर्ड से Admin Login करें।

## 5. Student अकाउंट
Student Login Roll Number को synthetic email में बदलता है:
`12001@student.shivcoachingcenter.com`

हर Student के लिए:
1. Firebase Authentication में Email/Password user बनाएँ। ऊपर वाला synthetic email इस्तेमाल करें।
2. Student profile वेबसाइट के Students पेज से बनाएँ।
3. Authentication UID को संबंधित `students/{studentId}` document के `authUid` field में जोड़ें।
4. `users/{uid}` document बनाएँ:
   - role: `student`
   - studentId: संबंधित student document ID
   - isActive: `true`
5. Student profile में accountStatus को `Active` करें।

**महत्वपूर्ण:** वेबसाइट का Add Student form केवल Firestore profile बनाता है, Authentication account अपने आप नहीं बनाता। Spark-only browser architecture में सुरक्षित Admin-side user provisioning उपलब्ध नहीं है। Password को Firestore में कभी न रखें।

## 6. स्थानीय Preview / Build
Node.js वातावरण में:
```bash
npm install
npm run dev
```
Production build:
```bash
npm run build
```

## 7. GitHub Pages
GitHub repository बनाएँ और project files upload करें। `vite.config.js` में `base` को repository path के अनुसार बदलें, जैसे `/shiv-coaching-center/`। GitHub Pages deploy workflow जोड़ें और build environment में Firebase VITE_ variables सेट करें।

GitHub Pages URL आम तौर पर:
`https://USERNAME.github.io/REPOSITORY/`

## 8. सीमाएँ और जाँच
- इस starter में student creation के बाद Authentication account का manual setup जरूरी है।
- Password reset Admin Firebase Console से करेगा।
- Backup JSON केवल ऐप में लोड डेटा export करता है; Authentication accounts/password export नहीं करता।
- PDF में हिंदी font embedding की पूर्ण गारंटी इस शुरुआती jsPDF implementation में नहीं है; हिंदी text के लिए browser print fallback बेहतर हो सकता है।
- Public leaderboard का सुरक्षित publishing workflow आगे जोड़ना चाहिए; private results को public न करें।
- Production उपयोग से पहले सभी Firestore Rules को अलग test accounts से जाँचें।
- इस starter को live करने से पहले security review और end-to-end testing जरूरी है।
