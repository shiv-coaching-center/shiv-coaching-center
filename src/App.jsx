import React, { useEffect, useMemo, useState } from 'react'
import { auth, db, firebaseConfigured, studentAuth } from './firebase'
import { studentAuthEmail, pct, resultStatus, rankRows, dateKey } from './utils'
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword, createUserWithEmailAndPassword, deleteUser } from 'firebase/auth'
import { collection, addDoc, getDoc, getDocs, doc, setDoc, updateDoc, deleteDoc, query, where, orderBy, serverTimestamp, writeBatch } from 'firebase/firestore'
import { BookOpen, LayoutDashboard, Users, ClipboardList, Trophy, CalendarCheck, Bell, Settings, LogOut, Menu, Moon, Sun, Search, Plus, Download, Share2, GraduationCap, LockKeyhole, ChartNoAxesCombined, Trash2, X } from 'lucide-react'
import { jsPDF } from 'jspdf'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

const BRAND = 'SHIV COACHING CENTER'
const empty = (v='') => v ?? ''
function normalizeClass(value){
  const clean=String(value||'').trim().toLowerCase().replace(/\s+/g,' ')
  if(['10th','10','high school','highschool','high-school','हाई स्कूल'].includes(clean)) return '10th'
  if(['12th','12','intermediate','inter','इंटर','इंटरमीडिएट'].includes(clean)) return '12th'
  return clean
}
function makeStudentPassword(){
  const bytes=crypto.getRandomValues(new Uint8Array(6))
  return Array.from(bytes, b => String(b % 10)).join('')
}
function Button({children, onClick, kind='primary', disabled=false, type='button'}) { return <button type={type} disabled={disabled} onClick={onClick} className={`btn ${kind}`}>{children}</button> }
function Field({label, ...props}) { return <label className="field"><span>{label}</span><input {...props}/></label> }
function Select({label, children, ...props}) { return <label className="field"><span>{label}</span><select {...props}>{children}</select></label> }
function Notice({message, error}) { return message ? <div className={error?'notice error':'notice'} role="alert">{message}</div> : null }
async function imageToDataUrl(file,maxWidth=1200){
 if(!file||!file.type.startsWith('image/'))throw new Error('कृपया सही इमेज चुनें।')
 const src=await new Promise((ok,no)=>{const x=new FileReader();x.onload=()=>ok(x.result);x.onerror=no;x.readAsDataURL(file)})
 const img=await new Promise((ok,no)=>{const x=new Image();x.onload=()=>ok(x);x.onerror=no;x.src=src})
 const scale=Math.min(1,maxWidth/img.width),cv=document.createElement('canvas');cv.width=Math.round(img.width*scale);cv.height=Math.round(img.height*scale);cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height)
 let q=.78,data=cv.toDataURL('image/jpeg',q);while(data.length>520000&&q>.35){q-=.08;data=cv.toDataURL('image/jpeg',q)}if(data.length>520000)throw new Error('इमेज बहुत बड़ी है। छोटी इमेज चुनें।');return data
}

export default function App() {
  const [user,setUser]=useState(null), [role,setRole]=useState(''), [profile,setProfile]=useState(null)
  const [authLoading,setAuthLoading]=useState(true)
  const [page,setPage]=useState('dashboard'), [menu,setMenu]=useState(false), [dark,setDark]=useState(localStorage.getItem('scc-dark')==='1')
  const [lang,setLang]=useState(localStorage.getItem('scc-lang')||'hi'), [busy,setBusy]=useState(false), [message,setMessage]=useState(''), [error,setError]=useState(false)
  const [email,setEmail]=useState(''), [password,setPassword]=useState(''), [roll,setRoll]=useState('')
  const [students,setStudents]=useState([]), [tests,setTests]=useState([]), [results,setResults]=useState([]), [notices,setNotices]=useState([]), [attendance,setAttendance]=useState([]), [credentials,setCredentials]=useState([]), [branding,setBranding]=useState(null), [classes,setClasses]=useState(['9th','10th','11th','12th']), [selectedAttendanceClass,setSelectedAttendanceClass]=useState('10th')
  const [search,setSearch]=useState(''), [form,setForm]=useState({}), [newStudentCredentials,setNewStudentCredentials]=useState(null), [noticeToDelete,setNoticeToDelete]=useState(null), [noticeImageOpen,setNoticeImageOpen]=useState('')
  const t=(hi,en)=>lang==='hi'?hi:en
  const say=(m,e=false)=>{setMessage(m);setError(e);setTimeout(()=>setMessage(''),6000)}

  useEffect(()=>{document.documentElement.dataset.theme=dark?'dark':'light';localStorage.setItem('scc-dark',dark?'1':'0')},[dark])
  useEffect(()=>{localStorage.setItem('scc-lang',lang)},[lang])

  // Wait for Firebase Auth and the matching Firestore profile before showing the app.
  useEffect(()=>{
    if(!auth || !db){
      setAuthLoading(false)
      return
    }
    let active=true
    const unsubscribe=onAuthStateChanged(auth, async (u)=>{
      if(!active) return
      setAuthLoading(true)

      if(!u){
        setUser(null)
        setRole('')
        setProfile(null)
        setAuthLoading(false)
        return
      }

      try{
        const snap=await getDoc(doc(db,'users',u.uid))
        if(!active) return

        if(!snap.exists()){
          setUser(null);setRole('');setProfile(null)
          await signOut(auth)
          say('इस अकाउंट की प्रोफाइल नहीं मिली। Admin से संपर्क करें।',true)
          return
        }

        const data=snap.data()
        if(data.isActive!==true){
          setUser(null);setRole('');setProfile(null)
          await signOut(auth)
          say('यह अकाउंट सक्रिय नहीं है। Admin से संपर्क करें।',true)
          return
        }

        if(!['admin','student'].includes(data.role)){
          setUser(null);setRole('');setProfile(null)
          await signOut(auth)
          say('इस अकाउंट की भूमिका सही नहीं है। Admin से संपर्क करें।',true)
          return
        }

        setUser(u)
        setRole(data.role)
        setProfile(data)
      }catch(e){
        if(!active) return
        setUser(null);setRole('');setProfile(null)
        await signOut(auth).catch(()=>{})
        say('प्रोफाइल जाँचने में समस्या: '+(e.code||e.message),true)
      }finally{
        if(active) setAuthLoading(false)
      }
    })
    return ()=>{active=false;unsubscribe()}
  },[])

  // Refresh portal data whenever a section is opened so attendance and newly published tests stay current.
  useEffect(()=>{ if(user && role) loadData() },[user,role,page])

  async function loadData(){
    try {
      if(role==='admin'){
        const [s,ts,rs,ns,at,cs,bs,classSnap]=await Promise.all([
          getDocs(collection(db,'students')),getDocs(collection(db,'tests')),getDocs(collection(db,'results')),getDocs(collection(db,'notices')),getDocs(collection(db,'attendance')),getDocs(collection(db,'studentCredentials')),getDoc(doc(db,'settings','branding')),getDoc(doc(db,'settings','classes'))
        ])
        const legacyCompletedTests=ts.docs.filter(d=>d.data().status==='Completed')
        if(legacyCompletedTests.length) await Promise.all(legacyCompletedTests.map(d=>updateDoc(d.ref,{status:'Published'})))
        setStudents(s.docs.map(d=>({...d.data(),id:d.id})));setTests(ts.docs.map(d=>({...d.data(),status:d.data().status==='Completed'?'Published':d.data().status,id:d.id})));setResults(rs.docs.map(d=>({...d.data(),id:d.id})));setNotices(ns.docs.map(d=>({...d.data(),id:d.id})));setAttendance(at.docs.map(d=>({...d.data(),id:d.id})));setCredentials(cs.docs.map(d=>({...d.data(),id:d.id})));setBranding(bs.exists()?bs.data():null);const availableClasses=Array.isArray(classSnap.data()?.items)&&classSnap.data().items.length?classSnap.data().items:['9th','10th','11th','12th'];setClasses(availableClasses);setSelectedAttendanceClass(current=>availableClasses.includes(current)?current:availableClasses[0])
      } else {
        const bs=await getDoc(doc(db,'settings','branding'))
        setBranding(bs.exists()?bs.data():null)
        const st=await getDocs(query(collection(db,'students'),where('authUid','==',user.uid)))
        const mine=st.docs.map(d=>({...d.data(),id:d.id}));setStudents(mine)
        if(mine[0]){
          const [rs,at,ns,ts]=await Promise.all([
            getDocs(query(collection(db,'results'),where('studentId','==',mine[0].id),where('publicationStatus','==','Published'))),
            getDocs(query(collection(db,'attendance'),where('studentId','==',mine[0].id))),
            getDocs(query(collection(db,'notices'),where('status','==','Published'),where('visibility','==','Students'))),
            // Fetch all published tests, including tests uploaded before this student account existed.
            getDocs(query(collection(db,'tests'),where('status','==','Published')))
          ])
          const ownClass=normalizeClass(mine[0].className||'12th')
          const publishedTests=ts.docs.map(d=>({...d.data(),id:d.id})).filter(test=>normalizeClass(test.className||'12th')===ownClass).sort((a,b)=>String(b.testDate||'').localeCompare(String(a.testDate||'')))
          setResults(rs.docs.map(d=>({...d.data(),id:d.id})))
          setAttendance(at.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))))
          setNotices(ns.docs.map(d=>({...d.data(),id:d.id})).filter(n=>!n.expiryDate||n.expiryDate>=dateKey()))
          setTests(publishedTests)
        }else{
          setResults([]);setAttendance([]);setNotices([]);setTests([])
        }
      }
    } catch(e){say('डेटा लोड नहीं हुआ: '+(e.code||e.message),true)}
  }

  async function login(e){
    e.preventDefault()
    if(!auth){say('Firebase कनेक्शन उपलब्ध नहीं है।',true);return}
    setBusy(true)
    setMessage('')
    try{
      const em=role==='student'?studentAuthEmail(roll.trim()):email.trim()
      await signInWithEmailAndPassword(auth,em,password)
      say('लॉगिन सफल।')
    }catch(e){
      const errors={
        'auth/invalid-credential':'ईमेल या पासवर्ड गलत है।',
        'auth/user-not-found':'यह ईमेल रजिस्टर नहीं है।',
        'auth/wrong-password':'पासवर्ड गलत है।',
        'auth/invalid-email':'ईमेल का फॉर्मेट गलत है।',
        'auth/too-many-requests':'बहुत अधिक प्रयास हुए हैं। थोड़ी देर बाद कोशिश करें।',
        'auth/network-request-failed':'इंटरनेट कनेक्शन जाँचें और दोबारा कोशिश करें।'
      }
      say(errors[e.code]||('लॉगिन नहीं हुआ: '+(e.code||e.message)),true)
    }finally{setBusy(false)}
  }

  async function logout(){await signOut(auth);setPage('dashboard');setPassword('')}
  async function saveClasses(next){
    const clean=[...new Set(next.map(x=>String(x).trim()).filter(Boolean))]
    if(!clean.length){say('कम-से-कम एक क्लास जरूरी है।',true);return}
    try{await setDoc(doc(db,'settings','classes'),{items:clean,updatedAt:serverTimestamp()},{merge:true});setClasses(clean);if(!clean.includes(selectedAttendanceClass))setSelectedAttendanceClass(clean[0]);say('क्लास सूची सेव हो गई।')}
    catch(e){say('क्लास सेव नहीं हुई: '+(e.code||e.message),true)}
  }
  async function addStudent(e){
    e.preventDefault()
    if(!auth || !db || !studentAuth){say('Firebase Authentication तैयार नहीं है। कनेक्शन जाँचें।',true);return}
    setBusy(true);setNewStudentCredentials(null)
    let createdUser=null
    try{
      const r=String(form.rollNumber||'').trim()
      const normalizedRoll=r.toLowerCase()
      const className=String(form.className||'').trim()
      if(!r) throw new Error('Roll Number दर्ज करें।')
      if(!String(form.fullName||'').trim()) throw new Error('स्टूडेंट का नाम दर्ज करें।')
      if(!className||!classes.some(c=>String(c).trim()===className)) throw new Error('स्टूडेंट अकाउंट बनाने से पहले क्लास चुनें।')
      if(students.some(s=>String(s.rollNumber||'').trim().toLowerCase()===normalizedRoll)) throw new Error('यह Roll Number पहले से मौजूद है।')
      const existing=await getDocs(query(collection(db,'students'),where('rollNumber','==',r)))
      if(!existing.empty) throw new Error('यह Roll Number पहले से मौजूद है।')

      // Reuse a previously archived login when a student record was reset/deleted.
      const archived=await getDocs(query(collection(db,'studentCredentials'),where('rollNumber','==',r)))
      const archivedCredential=archived.docs.find(d=>d.data().archived===true)
      let authUid,loginEmail,generatedPassword
      if(archivedCredential){
        const saved=archivedCredential.data()
        authUid=saved.authUid
        loginEmail=saved.loginEmail
        generatedPassword=saved.password
        if(!authUid||!loginEmail||!generatedPassword) throw new Error('पुराने Login की जानकारी अधूरी है। Firebase Authentication में पुराने अकाउंट को हटाकर दोबारा कोशिश करें।')
      }else{
        loginEmail=studentAuthEmail(r)
        generatedPassword=makeStudentPassword()
        const credential=await createUserWithEmailAndPassword(studentAuth,loginEmail,generatedPassword)
        createdUser=credential.user
        authUid=createdUser.uid
      }

      const studentRef=doc(collection(db,'students'))
      const userRef=doc(db,'users',authUid)
      const batch=writeBatch(db)
      batch.set(studentRef,{fullName:String(form.fullName).trim(),rollNumber:r,className,stream:form.stream||'Science',mobileNumber:form.mobileNumber||'',admissionDate:form.admissionDate||dateKey(),status:'Active',accountStatus:'Active',authUid,createdAt:serverTimestamp()})
      batch.set(userRef,{role:'student',isActive:true,studentId:studentRef.id,createdAt:serverTimestamp()},{merge:true})
      batch.set(doc(db,'studentCredentials',studentRef.id),{studentId:studentRef.id,authUid,fullName:String(form.fullName).trim(),rollNumber:r,loginEmail,password:generatedPassword,archived:false,createdAt:serverTimestamp()})
      if(archivedCredential) batch.delete(archivedCredential.ref)
      await batch.commit()

      setNewStudentCredentials({name:String(form.fullName).trim(),rollNumber:r,email:loginEmail,password:generatedPassword})
      setForm({});await loadData();say('स्टूडेंट का Login Account सफलतापूर्वक बन गया।')
      await signOut(studentAuth).catch(()=>{})
    }catch(e){
      if(createdUser){
        await deleteUser(createdUser).catch(async()=>{await signOut(studentAuth).catch(()=>{})})
      }
      const errors={
        'auth/email-already-in-use':'इस Roll Number का पुराना Firebase Login अभी मौजूद है, लेकिन उसका सुरक्षित रिकॉर्ड नहीं मिला। Firebase Console → Authentication → Users में पुराने student.shivcoachingcenter.com अकाउंट को एक बार हटाएँ, फिर दोबारा जोड़ें।',
        'auth/invalid-email':'Login ID का ईमेल फॉर्मेट सही नहीं है।',
        'auth/weak-password':'पासवर्ड कमजोर है। दोबारा कोशिश करें।',
        'auth/too-many-requests':'बहुत जल्दी अकाउंट बनाए गए हैं। कुछ देर बाद कोशिश करें।',
        'auth/network-request-failed':'इंटरनेट कनेक्शन जाँचें और दोबारा कोशिश करें.'
      }
      say(errors[e.code]||('स्टूडेंट अकाउंट नहीं बन पाया: '+(e.code||e.message)),true)
    }finally{setBusy(false)}
  }
  async function copyCredential(value,label){
    try{await navigator.clipboard.writeText(value);say(label+' कॉपी हो गया।')}
    catch{say('कॉपी नहीं हुआ। टेक्स्ट को दबाकर Copy चुनें।',true)}
  }
  async function deleteStudentAccount(student){
    const confirmed=window.confirm(`${student.fullName} (Roll: ${student.rollNumber}) का लॉगिन बंद करना चाहते हैं? पुराने Results और Attendance रिकॉर्ड सुरक्षित रहेंगे।`)
    if(!confirmed) return
    setBusy(true)
    try{
      // Disable the student's profile so the existing Firebase Auth account can no longer enter the portal.
      // Client-side Firebase Auth cannot delete another user's Auth account; this is a reversible deactivation.
      const batch=writeBatch(db)
      batch.update(doc(db,'students',student.id),{status:'Deleted',accountStatus:'Disabled',deletedAt:serverTimestamp()})
      if(student.authUid){
        batch.set(doc(db,'users',student.authUid),{isActive:false,disabledAt:serverTimestamp()},{merge:true})
      }
      await batch.commit()
      await loadData()
      say('स्टूडेंट का लॉगिन बंद कर दिया गया। पुराने Results और Attendance सुरक्षित हैं।')
    }catch(e){say('स्टूडेंट का लॉगिन बंद नहीं हुआ: '+(e.code||e.message),true)}
    finally{setBusy(false)}
  }
  async function permanentlyDeleteStudent(student){
    if(!student || typeof student.id !== 'string' || !student.id.trim()){say('स्टूडेंट का सही रिकॉर्ड ID नहीं मिला। पेज Refresh करें।',true);return}
    const confirmed=window.confirm(`स्थायी रूप से ${student.fullName} (Roll: ${student.rollNumber}) को हटाएँ? इससे उसका Student रिकॉर्ड, User Profile, Results और Attendance रिकॉर्ड हमेशा के लिए हटेंगे। यह वापस नहीं होगा।`)
    if(!confirmed) return
    const finalConfirm=window.confirm('आखिरी पुष्टि: क्या आप सच में इस स्टूडेंट का डेटा हमेशा के लिए मिटाना चाहते हैं?')
    if(!finalConfirm) return
    setBusy(true)
    try{
      const [resultDocs,attendanceDocs]=await Promise.all([
        getDocs(query(collection(db,'results'),where('studentId','==',student.id))),
        getDocs(query(collection(db,'attendance'),where('studentId','==',student.id)))
      ])
      const credentialRef=doc(db,'studentCredentials',student.id)
      const credentialSnap=await getDoc(credentialRef)
      const refs=[...resultDocs.docs,...attendanceDocs.docs, ...(student.authUid?[doc(db,'users',student.authUid)]:[]),doc(db,'students',student.id)]
      for(let i=0;i<refs.length;i+=450){
        const batch=writeBatch(db)
        refs.slice(i,i+450).forEach(ref=>batch.delete(ref))
        await batch.commit()
      }
      if(credentialSnap.exists()) await updateDoc(credentialRef,{archived:true,archivedAt:serverTimestamp()})
      await loadData()
      say('स्टूडेंट का रिकॉर्ड स्थायी रूप से हटा दिया गया।')
    }catch(e){say('स्थायी रूप से हटाया नहीं जा सका: '+(e.code||e.message),true)}
    finally{setBusy(false)}
  }

  async function deleteTest(test){
    if(!window.confirm(`"${test.testName}" और उससे जुड़े सभी Results हमेशा के लिए हटाएँ?`))return
    setBusy(true)
    try{const rows=await getDocs(query(collection(db,'results'),where('testId','==',test.id)));const refs=[...rows.docs,doc(db,'tests',test.id)];for(let i=0;i<refs.length;i+=450){const b=writeBatch(db);refs.slice(i,i+450).forEach(x=>b.delete(x));await b.commit()}await loadData();say('टेस्ट और उससे जुड़े Results हटा दिए गए। Student और Attendance सुरक्षित हैं।')}
    catch(e){say('टेस्ट हटाया नहीं जा सका: '+(e.code||e.message),true)}finally{setBusy(false)}
  }
  // TEMPORARY SALE-PREP RESET TOOL: remove this function and its Backup-page panel after testing.
  async function resetDemoData(){
    if(role!=='admin'||!db){say('यह सुविधा केवल Admin के लिए उपलब्ध है।',true);return}
    const first=window.confirm('क्या आप सभी Student records, Tests, Results, Attendance और Student Credentials हटाना चाहते हैं? Admin account, Notices और Website Settings सुरक्षित रहेंगे।')
    if(!first)return
    const typed=window.prompt('स्थायी रूप से डेटा हटाने के लिए RESET टाइप करें:')
    if(typed!=='RESET'){say('Reset रद्द कर दिया गया।');return}
    setBusy(true)
    try{
      const names=['students','tests','results','attendance','publicLeaderboard']
      const snapshots=await Promise.all([
        ...names.map(name=>getDocs(collection(db,name))),
        getDocs(query(collection(db,'users'),where('role','==','student')))
      ])
      const refs=snapshots.slice(0,names.length).flatMap(snap=>snap.docs.map(d=>({ref:d.ref,remove:true})))
      const studentUserDocs=snapshots[names.length].docs
      const credentialDocs=await getDocs(collection(db,'studentCredentials'))
      for(let i=0;i<credentialDocs.docs.length;i+=450){
        const batch=writeBatch(db)
        credentialDocs.docs.slice(i,i+450).forEach(d=>batch.update(d.ref,{archived:true,archivedAt:serverTimestamp()}))
        await batch.commit()
      }
      for(let i=0;i<refs.length;i+=450){
        const batch=writeBatch(db)
        refs.slice(i,i+450).forEach(item=>batch.delete(item.ref))
        await batch.commit()
      }
      for(let i=0;i<studentUserDocs.length;i+=450){
        const batch=writeBatch(db)
        studentUserDocs.slice(i,i+450).forEach(d=>batch.update(d.ref,{isActive:false,disabledAt:serverTimestamp()}))
        await batch.commit()
      }
      setStudents([]);setTests([]);setResults([]);setAttendance([]);setCredentials([])
      await loadData()
      say('Demo Data साफ हो गया। Admin account, Notices और Settings सुरक्षित हैं। Student Auth accounts Firebase Authentication में बने रहेंगे, लेकिन अब पोर्टल में लॉगिन नहीं कर पाएँगे।')
    }catch(e){say('डेटा Reset नहीं हुआ: '+(e.code||e.message),true)}
    finally{setBusy(false)}
  }

  async function saveBranding(e){
    e.preventDefault();setBusy(true)
    try{
      const next={title:String(form.brandTitle??branding?.title??'').trim(),subtitle:String(form.brandSubtitle??branding?.subtitle??'').trim(),imageData:form.brandImage||branding?.imageData||'',updatedAt:serverTimestamp()}
      await setDoc(doc(db,'settings','branding'),next,{merge:true})
      setBranding({...next,updatedAt:new Date()});setForm(v=>({...v,brandImage:''}));say('Banner बदल गया ✅')
    }catch(e){say('Banner सेव नहीं हुआ: '+(e.code||e.message),true)}finally{setBusy(false)}
  }
  async function removeBanner(){
    if(!window.confirm('क्या आप Banner हटाकर Default Gradient लगाना चाहते हैं?'))return
    setBusy(true)
    try{const next={title:String(form.brandTitle??branding?.title??'').trim(),subtitle:String(form.brandSubtitle??branding?.subtitle??'').trim(),imageData:'',updatedAt:serverTimestamp()};await setDoc(doc(db,'settings','branding'),next,{merge:true});setBranding({...next});setForm(v=>({...v,brandImage:''}));say('Banner हटा दिया गया। Default Gradient सक्रिय है।')}
    catch(e){say('Banner नहीं हटाया जा सका: '+(e.code||e.message),true)}finally{setBusy(false)}
  }
  async function deleteNotice(notice){
    if(!notice?.id)return
    setBusy(true)
    try{await deleteDoc(doc(db,'notices',notice.id));setNotices(v=>v.filter(x=>x.id!==notice.id));setNoticeToDelete(null);say('Notice हटा दिया गया。')}
    catch(e){say(e.code==='permission-denied'?'Firestore Rules ने Delete रोक दिया। notices में allow create, update, delete: if isAdmin(); जाँचें।':'Notice हटाया नहीं जा सका: '+(e.code||e.message),true)}
    finally{setBusy(false)}
  }
  async function addTest(e){
    e.preventDefault()
    const testName=String(form.testName||'').trim()
    const totalMarks=Number(form.totalMarks)
    const passingMarks=Number(form.passingMarks)
    const className=String(form.className||'').trim()
    if(!testName){say('टेस्ट का नाम दर्ज करें।',true);return}
    if(!className||!classes.some(c=>String(c).trim()===className)){say('टेस्ट प्रकाशित करने से पहले क्लास चुनें।',true);return}
    if(!Number.isFinite(totalMarks)||totalMarks<=0){say('Total Marks शून्य से अधिक सही संख्या होनी चाहिए।',true);return}
    if(!Number.isFinite(passingMarks)||passingMarks<0||passingMarks>totalMarks){say('Passing Marks, 0 से Total Marks के बीच रखें।',true);return}
    setBusy(true)
    try{
      await addDoc(collection(db,'tests'),{
        testName,testType:form.testType||'Weekly',subject:form.subject||'Physics',
        className,
        testDate:form.testDate||dateKey(),totalMarks,passingMarks,
        description:String(form.description||'').trim(),status:'Published',
        createdAt:serverTimestamp(),updatedAt:serverTimestamp()
      })
      setForm(v=>({...v,testName:'',className:'',totalMarks:'',passingMarks:'',description:''}))
      await loadData();say('टेस्ट सफलतापूर्वक प्रकाशित हो गया।')
    }catch(e){say('टेस्ट नहीं बन पाया: '+(e.code||e.message),true)}finally{setBusy(false)}
  }
  async function saveMarks(e){
    e.preventDefault()
    const test=tests.find(x=>x.id===form.testId)
    if(!test){say('पहले टेस्ट चुनें।',true);return}
    const batchRows=students.filter(st=>st.status==='Active'&&normalizeClass(st.className||'12th')===normalizeClass(test.className||'12th'))
    if(!batchRows.length){say('इस टेस्ट की क्लास में कोई Active विद्यार्थी नहीं है।',true);return}
    const prepared=[]
    for(const st of batchRows){
      const raw=form[`m_${st.id}`]
      const att=form[`a_${st.id}`]||'Present'
      if(!['Present','Absent'].includes(att)){say(`${st.fullName}: Attendance विकल्प सही नहीं है।`,true);return}
      if(att==='Present'&&(raw===''||raw===undefined||!Number.isFinite(Number(raw)))){say(`${st.fullName} के नंबर भरें या Absent चुनें।`,true);return}
      const marks=att==='Absent'?0:Number(raw)
      if(att==='Present'&&(marks<0||marks>Number(test.totalMarks))){say(`${st.fullName}: नंबर 0 से ${test.totalMarks} के बीच होने चाहिए।`,true);return}
      prepared.push({student:st,attendance:att,marks})
    }
    setBusy(true)
    try{
      const operations=[]
      for(const row of prepared){
        const existing=await getDocs(query(collection(db,'results'),where('testId','==',test.id),where('studentId','==',row.student.id)))
        const data={
          testId:test.id,studentId:row.student.id,studentNameSnapshot:row.student.fullName,
          rollNumberSnapshot:row.student.rollNumber,obtainedMarks:row.marks,totalMarks:Number(test.totalMarks),
          passingMarks:Number(test.passingMarks),percentage:row.attendance==='Absent'?0:pct(row.marks,test.totalMarks),
          attendance:row.attendance,resultStatus:resultStatus(row.marks,test.passingMarks,row.attendance),
          publicationStatus:'Draft',updatedAt:serverTimestamp()
        }
        if(existing.empty) operations.push({type:'set',ref:doc(collection(db,'results')),data:{...data,createdAt:serverTimestamp()}})
        else{
          operations.push({type:'set',ref:existing.docs[0].ref,data})
          existing.docs.slice(1).forEach(d=>operations.push({type:'delete',ref:d.ref}))
        }
      }
      for(let i=0;i<operations.length;i+=450){
        const batch=writeBatch(db)
        operations.slice(i,i+450).forEach(op=>op.type==='delete'?batch.delete(op.ref):batch.set(op.ref,op.data,{merge:true}))
        await batch.commit()
      }
      await loadData();say(`${prepared.length} विद्यार्थियों के नंबर Draft में सेव हो गए। Publish करने से पहले जाँचें।`)
    }catch(e){say('Marks सेव नहीं हुए: '+(e.code||e.message),true)}finally{setBusy(false)}
  }
  async function publish(testId,status){
    if(!['Published','Draft'].includes(status)){say('रिजल्ट की स्थिति सही नहीं है।',true);return}
    const rows=results.filter(r=>r.testId===testId)
    if(!rows.length){say('इस टेस्ट के नंबर अभी सेव नहीं हुए हैं। पहले Marks Entry करें।',true);return}
    if(rows.length>450){say('एक बार में 450 से अधिक रिजल्ट प्रकाशित नहीं किए जा सकते।',true);return}
    setBusy(true)
    try{
      const ranked=rankRows(rows)
      const batch=writeBatch(db)
      rows.forEach(r=>{
        const rank=ranked.find(x=>x.id===r.id)?.rank??null
        batch.update(doc(db,'results',r.id),{rank,publicationStatus:status,updatedAt:serverTimestamp()})
      })
      await batch.commit()
      await loadData();say(status==='Published'?'रिजल्ट प्रकाशित हो गया।':'रिजल्ट Draft में वापस कर दिया गया।')
    }catch(e){say('रिजल्ट अपडेट नहीं हुआ: '+(e.code||e.message),true)}finally{setBusy(false)}
  }
  async function markAttendance(e){
    e.preventDefault()
    const date=form.attDate||dateKey()
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(new Date(date+'T00:00:00').getTime())){
      say('कृपया सही तारीख चुनें।',true);return
    }
    const classRows=students.filter(st=>st.status==='Active'&&normalizeClass(st.className||'12th')===normalizeClass(selectedAttendanceClass))
    if(!classRows.length){say('इस क्लास में कोई Active विद्यार्थी नहीं है।',true);return}
    const prepared=classRows.map(st=>({student:st,status:form[`att_${st.id}`]||'Present'}))
    const invalid=prepared.find(row=>!['Present','Absent'].includes(row.status))
    if(invalid){say(`${invalid.student.fullName}: Attendance स्थिति सही नहीं है।`,true);return}
    setBusy(true)
    try{
      // Stable document IDs make same-day re-entry an update, never a duplicate.
      const operations=prepared.map(({student,status})=>({
        ref:doc(db,'attendance',`${date}_${student.id}`),
        data:{
          studentId:student.id,studentName:student.fullName,rollNumber:student.rollNumber,
          className:student.className||'12th',date,status,updatedAt:serverTimestamp()
        }
      }))
      for(let i=0;i<operations.length;i+=450){
        const batch=writeBatch(db)
        operations.slice(i,i+450).forEach(op=>batch.set(op.ref,op.data,{merge:true}))
        await batch.commit()
      }
      await loadData()
      say(`${prepared.length} विद्यार्थियों की Attendance ${date} के लिए सेव हो गई।`)
    }catch(e){say('Attendance सेव नहीं हुई: '+(e.code||e.message),true)}
    finally{setBusy(false)}
  }
  async function addNotice(e){
    e.preventDefault()
    const title=String(form.title||'').trim(),description=String(form.description||'').trim(),expiryDate=String(form.expiryDate||'').trim()
    if(!title&&!description&&!form.noticeImage){say('Notice में शीर्षक, संदेश या इमेज में से कुछ जोड़ें।',true);return}
    if(expiryDate&&!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)){say('Expiry Date सही चुनें।',true);return}
    if(expiryDate&&expiryDate<dateKey()){say('Expiry Date आज या भविष्य की तारीख होनी चाहिए।',true);return}
    setBusy(true)
    try{
      await addDoc(collection(db,'notices'),{title,description,imageData:form.noticeImage||'',category:form.category||'General',status:'Published',visibility:'Students',createdAt:serverTimestamp(),expiryDate,updatedAt:serverTimestamp()})
      setForm({});await loadData();say('Notice सफलतापूर्वक प्रकाशित हो गया।')
    }catch(e){say('Notice प्रकाशित नहीं हुआ: '+(e.code||e.message),true)}
    finally{setBusy(false)}
  }
  function downloadBackup(){
    const payload={exportedAt:new Date().toISOString(),students,tests,results,attendance,notices}
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`SCC_Backup_${dateKey()}.json`;a.click();URL.revokeObjectURL(a.href)
  }
  function pdf(r){
    const d=new jsPDF();d.setFontSize(20);d.text(BRAND,105,20,{align:'center'});d.setFontSize(11);d.text('ज्ञान • अनुशासन • सफलता',105,28,{align:'center'});d.line(15,34,195,34)
    d.setFontSize(16);d.text('STUDENT TEST RESULT',105,46,{align:'center'})
    const lines=[`Student: ${r.studentNameSnapshot}`,`Roll Number: ${r.rollNumberSnapshot}`,`Test: ${tests.find(x=>x.id===r.testId)?.testName||''}`,`Subject: ${tests.find(x=>x.id===r.testId)?.subject||''}`,`Marks: ${r.obtainedMarks}/${r.totalMarks}`,`Percentage: ${r.percentage}%`,`Status: ${r.resultStatus}`,`Rank: ${r.rank??'-'}`]
    lines.forEach((x,i)=>d.text(x,20,62+i*12));d.save(`SCC_${r.rollNumberSnapshot}_Result.pdf`)
  }
  function share(r){
    const msg=`नमस्ते ${r.studentNameSnapshot}! आपका टेस्ट रिजल्ट जारी है। अंक: ${r.obtainedMarks}/${r.totalMarks}, प्रतिशत: ${r.percentage}%, रैंक: ${r.rank??'-'}, परिणाम: ${r.resultStatus}। अपना पूरा रिजल्ट देखने के लिए Shiv Coaching Center Student Portal पर लॉगिन करें।`
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`,'_blank')
  }

  const myStudent=students[0]
  const selectedTest=tests.find(x=>x.id===form.testId)
  const dashboardResults=role==='admin'?results.filter(r=>r.publicationStatus==='Published'):results
  const avg=dashboardResults.length?Math.round(dashboardResults.reduce((a,r)=>a+Number(r.percentage||0),0)/dashboardResults.length):0
  const nav=role==='admin'?[
    ['dashboard','Dashboard',LayoutDashboard],['students','Students',Users],['deletedstudents','Deleted Students',Trash2],['tests','Tests',ClipboardList],['marks','Marks Entry',BookOpen],['results','Results',Trophy],['attendance','Attendance',CalendarCheck],['notices','Notices',Bell],['backup','Backup',Download]
  ]:[['dashboard','Dashboard',LayoutDashboard],['mytests','My Tests',ClipboardList],['myresults','My Results',Trophy],['performance','Performance',ChartNoAxesCombined],['attendance','My Attendance',CalendarCheck],['notices','Notice Board',Bell]]

  if(!firebaseConfigured)return <div className="setup"><div className="brandmark"><GraduationCap size={34}/></div><h1>{BRAND}</h1><h2>Firebase Setup Required</h2><p>यह प्रोजेक्ट तैयार है, लेकिन Firebase की जानकारी अभी जोड़ी नहीं गई है।</p><p><b>अगला कदम:</b> Firebase Console में Web App बनाएँ और README में दिए गए निर्देशों के अनुसार .env फ़ाइल में Firebase Config भरें।</p><div className="setupbox">VITE_FIREBASE_API_KEY<br/>VITE_FIREBASE_AUTH_DOMAIN<br/>VITE_FIREBASE_PROJECT_ID<br/>VITE_FIREBASE_APP_ID</div><small>बिना Firebase Configuration के Login और Database काम नहीं करेंगे।</small></div>

  if(authLoading)return <div className="setup"><div className="brandmark"><GraduationCap size={34}/></div><h2>लोड हो रहा है...</h2><p>Firebase अकाउंट की जाँच की जा रही है।</p></div>

  if(!user)return <div className="loginpage"><div className="loginhero"><div className="brandmark"><GraduationCap size={36}/></div><h1>{BRAND}</h1><p>ज्ञान • अनुशासन • सफलता</p></div><div className="loginbox"><h2>{t('SHIV COACHING CENTER','SHIV COACHING CENTER')}</h2><Notice message={message} error={error}/><div className="tabs"><button type="button" className={role!=='student'?'active':''} onClick={()=>{setRole('admin');setMessage('')}}>Admin</button><button type="button" className={role==='student'?'active':''} onClick={()=>{setRole('student');setMessage('')}}>Student</button></div><form onSubmit={login}>{role==='student'?<Field label="Roll Number" value={roll} onChange={e=>setRoll(e.target.value)} required placeholder="जैसे 12001"/>:<Field label="Admin Email" type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="Admin Email"/>}<Field label="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} required placeholder="Password"/><Button type="submit" disabled={busy}>{busy?'Please wait...':'Login'}</Button></form><p className="hint">Student password भूलने पर Coaching Admin से संपर्क करें।</p></div></div>

  return <div className="app">{menu&&<button className="menu-backdrop" aria-label="Close menu" onClick={()=>setMenu(false)}/>}<aside className={menu?'sidebar open':'sidebar'}><div className="sidebrand"><div className="brandmark"><GraduationCap/></div><div><b>SHIV COACHING</b><small>CENTER PORTAL</small></div><button className="menu-close mobileonly" aria-label="Close menu" onClick={()=>setMenu(false)}><X/></button></div><div className="navlabel">{role==='admin'?'ADMIN MENU':'STUDENT MENU'}</div>{nav.map(([id,label,Icon])=><button key={id} className={`navitem ${page===id?'selected':''}`} onClick={()=>{setPage(id);setMenu(false)}}><Icon size={18}/>{label}</button>)}<div className="sidebottom"><button className="navitem" onClick={()=>setDark(!dark)}>{dark?<Sun size={18}/>:<Moon size={18}/>} {dark?'Light Mode':'Dark Mode'}</button><button className="navitem" onClick={()=>setLang(lang==='hi'?'en':'hi')}>文 {lang==='hi'?'English':'हिन्दी'}</button><button className="navitem" onClick={logout}><LogOut size={18}/> Logout</button></div></aside><main className="main"><header className="topbar"><button className="iconbtn mobileonly" onClick={()=>setMenu(!menu)}><Menu/></button><div><b>{BRAND}</b><small>{role==='admin'?'Administrator':'Student Portal'}</small></div><button className="iconbtn" onClick={()=>setDark(!dark)}>{dark?<Sun/>:<Moon/>}</button></header>{role==='student'&&<div className="student-identity-bar"><div className="student-identity-name"><span className="student-identity-avatar"><GraduationCap size={19}/></span><div><strong>{myStudent?.fullName||profile?.fullName||'Student'}</strong><small>आपकी Student ID जानकारी</small></div></div><div className="student-identity-details"><div><small>आपकी क्लास</small><strong>{myStudent?.className||profile?.className||'क्लास उपलब्ध नहीं'}</strong></div><div><small>Roll Number</small><strong>{myStudent?.rollNumber||profile?.rollNumber||'उपलब्ध नहीं'}</strong></div></div></div>}<div className="content"><Notice message={message} error={error}/>{page==='dashboard'&&<><section className="dashboard-banner-wrap">
    {branding?.imageData?<img className="dashboard-banner-image" src={branding.imageData} alt="Shiv Coaching Center banner"/>:<div className="dashboard-banner-default"><span>SHIV COACHING CENTER</span><small>ज्ञान • अनुशासन • सफलता</small></div>}
    {(branding?.title||branding?.subtitle)&&<div className="dashboard-banner-caption">{branding?.title&&<strong>{branding.title}</strong>}{branding?.title&&branding?.subtitle&&<span className="caption-dot">•</span>}{branding?.subtitle&&<span>{branding.subtitle}</span>}</div>}
  </section>
  {role==='admin'&&<div className="panel banner-settings"><h3>Banner Settings</h3><form className="formgrid" onSubmit={saveBranding}><Field label="Title (optional)" value={form.brandTitle??branding?.title??''} onChange={e=>setForm({...form,brandTitle:e.target.value})} placeholder="जैसे: SHIV COACHING CENTER"/><Field label="Subtitle (optional)" value={form.brandSubtitle??branding?.subtitle??''} onChange={e=>setForm({...form,brandSubtitle:e.target.value})} placeholder="जैसे: ज्ञान • अनुशासन • सफलता"/><label className="field full"><span>नई Banner Image चुनें</span><input type="file" accept="image/*" onChange={async e=>{try{const v=await imageToDataUrl(e.target.files?.[0],1200);setForm(x=>({...x,brandImage:v}))}catch(err){say(err.message,true)}}}/></label>{(form.brandImage||branding?.imageData)&&<img className="brand-preview" src={form.brandImage||branding.imageData} alt="Banner preview"/>}<div className="banner-actions full"><Button type="submit" disabled={busy||(!form.brandImage&&!branding?.imageData&&!form.brandTitle&&!form.brandSubtitle)}>Save Banner</Button><Button kind="danger" disabled={busy||!branding?.imageData} onClick={removeBanner}>Banner हटाओ</Button></div></form></div>}<div className="stats">{(role==='admin'?[['Total Students',students.filter(s=>s.status!=='Deleted').length],['Total Tests',tests.length],['Published Results',results.filter(r=>r.publicationStatus==='Published').length],['Published Avg.',`${avg}%`]]:[['My Tests',tests.length],['Average',`${avg}%`],['Attendance',`${attendance.length?Math.round(attendance.filter(a=>a.status==='Present').length/Math.max(1,attendance.filter(a=>['Present','Absent'].includes(a.status)).length)*100):0}%`],['Notices',notices.length]]).map(([a,b])=><div className="stat" key={a}><small>{a}</small><strong>{b}</strong></div>)}</div><div className="panel"><h3>{role==='admin'?'Quick Actions':'Recent Results'}</h3>{role==='admin'?<div className="quick">{[['students','Add Student'],['tests','Create Test'],['marks','Enter Marks'],['attendance','Mark Attendance'],['notices','Add Notice']].map(([p,l])=><Button key={p} kind="soft" onClick={()=>setPage(p)}><Plus size={16}/>{l}</Button>)}</div>:<ResultList rows={results} tests={tests} pdf={pdf} share={share}/>}</div>{role==='admin'&&<div className="panel"><div className="panelhead"><h3>Recent Tests</h3><Button kind="soft" onClick={()=>setPage('tests')}>सभी टेस्ट देखें</Button></div>{tests.length?<div className="tablewrap"><table><thead><tr><th>टेस्ट</th><th>क्लास</th><th>विषय</th><th>तारीख</th><th>स्थिति</th></tr></thead><tbody>{[...tests].sort((a,b)=>String(b.testDate||'').localeCompare(String(a.testDate||''))).map(x=><tr key={x.id}><td>{x.testName}</td><td><span className="pill">{x.className||'12th'}</span></td><td>{x.subject}</td><td>{x.testDate}</td><td>{x.status}</td></tr>)}</tbody></table></div>:<div className="empty">अभी कोई टेस्ट नहीं बनाया गया है।</div>}</div>}<div className="panel latest-notices-panel"><div className="panelhead"><h3>Latest Notices</h3><span className="notice-count">{notices.length} सूचनाएँ</span></div><NoticeList rows={notices} isAdmin={role==='admin'} onDelete={setNoticeToDelete} onImageClick={setNoticeImageOpen}/></div></>}
  {page==='students'&&role==='admin'&&<><PageTitle title="Student Management" sub="हर क्लास के विद्यार्थी अलग-अलग मैनेज करें"/><div className="panel"><h3>Manage Classes</h3><div className="class-chip-list">{classes.map(c=><span className="class-chip" key={c}>{c}<button type="button" onClick={()=>{if(students.some(s=>normalizeClass(s.className||'12th')===normalizeClass(c)&&s.status!=='Deleted')){say('इस क्लास में विद्यार्थी मौजूद हैं। पहले उन्हें दूसरी क्लास में स्थानांतरित करें।',true);return}if(classes.length===1){say('कम-से-कम एक क्लास जरूरी है।',true);return}saveClasses(classes.filter(x=>x!==c))}}>×</button></span>)}</div><form className="class-add-row" onSubmit={e=>{e.preventDefault();const value=String(form.newClass||'').trim();if(!value)return;if(classes.some(c=>c.toLowerCase()===value.toLowerCase())){say('यह क्लास पहले से मौजूद है।',true);return}saveClasses([...classes,value]);setForm(v=>({...v,newClass:''}))}}><Field label="नई क्लास का नाम" value={form.newClass||''} onChange={e=>setForm({...form,newClass:e.target.value})} placeholder="जैसे: 8th या 6th"/><Button type="submit">क्लास जोड़ें</Button></form></div><div className="panel"><h3>Add Student</h3><form className="formgrid" onSubmit={addStudent}><Field label="Full Name" value={empty(form.fullName)} onChange={e=>setForm({...form,fullName:e.target.value})} required/><Field label="Roll Number" value={empty(form.rollNumber)} onChange={e=>setForm({...form,rollNumber:e.target.value})} required/><Select label="Class" value={form.className||''} required onChange={e=>setForm({...form,className:e.target.value})}><option value="">पहले क्लास चुनें</option>{classes.map(c=><option key={c} value={c}>{c}</option>)}</Select><Select label="Stream" value={form.stream||'Science'} onChange={e=>setForm({...form,stream:e.target.value})}><option>Science</option><option>Arts</option><option>Commerce</option></Select><Field label="Mobile Number" value={empty(form.mobileNumber)} onChange={e=>setForm({...form,mobileNumber:e.target.value})}/><Field label="Admission Date" type="date" value={form.admissionDate||dateKey()} onChange={e=>setForm({...form,admissionDate:e.target.value})}/><div className="full"><Button type="submit" disabled={busy}>{busy?'Account बनाया जा रहा है...':'Create Student Account'}</Button></div></form></div>{newStudentCredentials&&<div className="panel"><div className="panelhead"><h3>स्टूडेंट का Login तैयार है</h3><Button kind="soft" onClick={()=>setNewStudentCredentials(null)}>बंद करें</Button></div><p><b>नाम:</b> {newStudentCredentials.name}</p><p><b>Roll Number:</b> {newStudentCredentials.rollNumber}</p><p><b>Login ID:</b> <code>{newStudentCredentials.email}</code></p><Button kind="soft" onClick={()=>copyCredential(newStudentCredentials.email,'Login ID')}>Copy Login ID</Button><p><b>Password:</b> <code>{newStudentCredentials.password}</code></p><Button kind="soft" onClick={()=>copyCredential(newStudentCredentials.password,'Password')}>Copy Password</Button><p className="hint">यह पासवर्ड केवल अभी दिखाया जा रहा है। इसे स्टूडेंट को सुरक्षित तरीके से दे दें। इस पैनल को बंद करने के बाद पासवर्ड दोबारा नहीं दिखेगा।</p></div>}<div className="panel"><div className="panelhead"><h3>Student List ({students.filter(s=>s.status!=='Deleted').length})</h3><Select label="क्लास फ़िल्टर" value={form.studentClassFilter||'All'} onChange={e=>setForm({...form,studentClassFilter:e.target.value})}><option value="All">सभी क्लास</option>{classes.map(c=><option key={c}>{c}</option>)}</Select><div className="search"><Search size={16}/><input placeholder="Search name / roll" value={search} onChange={e=>setSearch(e.target.value)}/></div></div><div className="tablewrap"><table><thead><tr><th>Name</th><th>Roll</th><th>Class</th><th>Account</th><th>Status</th><th>Action</th></tr></thead><tbody>{students.filter(s=>s.status!=='Deleted'&&(form.studentClassFilter==='All'||!form.studentClassFilter||normalizeClass(s.className||'12th')===normalizeClass(form.studentClassFilter))&&(s.fullName+' '+s.rollNumber).toLowerCase().includes(search.toLowerCase())).map(s=><tr key={s.id}><td>{s.fullName}</td><td>{s.rollNumber}</td><td>{s.className}</td><td>{s.accountStatus||'Pending'}</td><td>{s.status}</td><td><Button kind="danger" disabled={busy} onClick={()=>deleteStudentAccount(s)}><Trash2 size={14}/> Delete</Button></td></tr>)}</tbody></table></div><div className="panel"><h3>Student Login Credentials (Admin Only)</h3><div className="tablewrap"><table><thead><tr><th>Name</th><th>Roll</th><th>Login ID</th><th>Password</th></tr></thead><tbody>{credentials.filter(x=>x.archived!==true).map(x=><tr key={x.id}><td>{x.fullName}</td><td>{x.rollNumber}</td><td><code>{x.loginEmail}</code> <button className="tiny" onClick={()=>copyCredential(x.loginEmail,'Login ID')}>Copy</button></td><td><code>{x.password}</code> <button className="tiny" onClick={()=>copyCredential(x.password,'Password')}>Copy</button></td></tr>)}</tbody></table></div><p className="hint">पासवर्ड अलग Admin-only Firestore संग्रह में सेव है। इसे निजी रखें।</p></div></div></>}
  {page==='deletedstudents'&&role==='admin'&&<><PageTitle title="Deleted Students" sub="यहाँ केवल हटाए गए विद्यार्थी दिखाई देंगे"/><div className="panel"><div className="panelhead"><h3>Deleted Student List ({students.filter(s=>s.status==='Deleted').length})</h3><div className="search"><Search size={16}/><input placeholder="Search name / roll" value={search} onChange={e=>setSearch(e.target.value)}/></div></div><div className="tablewrap"><table><thead><tr><th>Name</th><th>Roll</th><th>Class</th><th>Action</th></tr></thead><tbody>{students.filter(s=>s.status==='Deleted'&&(s.fullName+' '+s.rollNumber).toLowerCase().includes(search.toLowerCase())).map(s=><tr key={s.id}><td>{s.fullName}</td><td>{s.rollNumber}</td><td>{s.className}</td><td><Button kind="danger" disabled={busy} onClick={()=>permanentlyDeleteStudent(s)}><Trash2 size={14}/> Permanent Delete</Button></td></tr>)}</tbody></table></div>{students.filter(s=>s.status==='Deleted'&&(s.fullName+' '+s.rollNumber).toLowerCase().includes(search.toLowerCase())).length===0&&<p className="empty">{students.some(s=>s.status==='Deleted')?'इस Search में कोई Deleted Student नहीं मिला।':'अभी कोई Deleted Student नहीं है।'}</p>}<p className="hint">Permanent Delete करने पर Student, User Profile, Results और Attendance रिकॉर्ड हटेंगे। Firebase Authentication का मूल अकाउंट फ्रंटएंड से स्थायी रूप से नहीं मिटाया जा सकता; User Profile हटने पर पोर्टल लॉगिन ब्लॉक रहेगा।</p></div></>}
  {page==='tests'&&role==='admin'&&<><PageTitle title="Test Management" sub="Weekly, Monthly और Subject-wise Tests"/><div className="panel"><h3>Create New Test</h3><form className="formgrid" onSubmit={addTest}><Field label="Test Name" value={empty(form.testName)} onChange={e=>setForm({...form,testName:e.target.value})} required/><Select label="Test Type" value={form.testType||'Weekly'} onChange={e=>setForm({...form,testType:e.target.value})}><option>Weekly</option><option>Monthly</option><option>Subject-wise</option></Select><Select label="Subject" value={form.subject||'Physics'} onChange={e=>setForm({...form,subject:e.target.value})}>{['Physics','Chemistry','Mathematics','Biology','English','Hindi'].map(x=><option key={x}>{x}</option>)}</Select><Select label="Class" value={form.className||'12th'} onChange={e=>setForm({...form,className:e.target.value})}>{classes.map(c=><option key={c}>{c}</option>)}</Select><Field label="Test Date" type="date" value={form.testDate||dateKey()} onChange={e=>setForm({...form,testDate:e.target.value})}/><Field label="Total Marks" type="number" min="1" value={empty(form.totalMarks)} onChange={e=>setForm({...form,totalMarks:e.target.value})} required/><Field label="Passing Marks" type="number" min="0" value={empty(form.passingMarks)} onChange={e=>setForm({...form,passingMarks:e.target.value})} required/><div className="full"><Button type="submit" disabled={busy}>Create Test</Button></div></form></div><div className="panel"><h3>All Tests</h3><div className="tablewrap"><table><thead><tr><th>Test</th><th>Class</th><th>Subject</th><th>Date</th><th>Marks</th><th>Status</th><th>Action</th></tr></thead><tbody>{tests.map(x=><tr key={x.id}><td>{x.testName}</td><td><span className="pill">{x.className||'12th'}</span></td><td>{x.subject}</td><td>{x.testDate}</td><td>{x.totalMarks}</td><td>{x.status}</td><td><Button kind="danger" disabled={busy} onClick={()=>deleteTest(x)}><Trash2 size={14}/> Delete Test</Button></td></tr>)}</tbody></table></div></div></>}
  {page==='marks'&&role==='admin'&&<><PageTitle title="Marks Entry" sub="एक टेस्ट चुनें और सभी विद्यार्थियों के नंबर भरें"/><div className="panel"><Select label="Select Test" value={form.testId||''} onChange={e=>setForm({...form,testId:e.target.value})}><option value="">Choose test</option>{tests.map(x=><option value={x.id} key={x.id}>{x.testName} · {x.subject}</option>)}</Select><form onSubmit={saveMarks}><div className="tablewrap"><table><thead><tr><th>Student</th><th>Marks</th><th>Attendance</th></tr></thead><tbody>{students.filter(s=>s.status==='Active'&&selectedTest&&normalizeClass(s.className||'12th')===normalizeClass(selectedTest.className||'12th')).map(s=><tr key={s.id}><td>{s.fullName}<small className="block">{s.rollNumber}</small></td><td><input className="markinput" type="number" min="0" max={selectedTest.totalMarks} step="any" value={form[`m_${s.id}`]??''} disabled={form[`a_${s.id}`]==='Absent'} onChange={e=>setForm({...form,[`m_${s.id}`]:e.target.value})}/></td><td><select value={form[`a_${s.id}`]||'Present'} onChange={e=>setForm({...form,[`a_${s.id}`]:e.target.value})}><option>Present</option><option>Absent</option></select></td></tr>)}</tbody></table></div><Button type="submit" disabled={busy||!form.testId}>Save Marks as Draft</Button></form></div></>}
  {page==='results'&&role==='admin'&&<><PageTitle title="Result Management" sub="रिजल्ट जाँचें, प्रकाशित या Unpublish करें"/>{tests.map(test=><div className="panel" key={test.id}><div className="panelhead"><div><h3>{test.testName}</h3><small>{test.subject} · {test.testDate} · {test.totalMarks} Marks</small></div><div className="actions"><Button kind="soft" onClick={()=>publish(test.id,'Published')}>Publish</Button><Button kind="danger" onClick={()=>publish(test.id,'Draft')}>Unpublish</Button></div></div><ResultList rows={results.filter(r=>r.testId===test.id)} tests={tests} pdf={pdf} share={share}/></div>)}</>}
  {page==='mytests'&&role==='student'&&<><PageTitle title="My Tests" sub="आपकी क्लास के प्रकाशित टेस्ट"/><div className="panel"><div className="tablewrap"><table><thead><tr><th>Test</th><th>Subject</th><th>Date</th><th>Total Marks</th><th>Status</th></tr></thead><tbody>{tests.filter(x=>normalizeClass(x.className||'12th')===normalizeClass(myStudent?.className||'12th')).map(x=><tr key={x.id}><td>{x.testName}<small className="block">{x.testType||'Test'}</small></td><td>{x.subject}</td><td>{x.testDate}</td><td>{x.totalMarks}</td><td><span className="pill good">Published</span></td></tr>)}</tbody></table></div>{tests.filter(x=>normalizeClass(x.className||'12th')===normalizeClass(myStudent?.className||'12th')).length===0&&<div className="empty">अभी आपकी क्लास के लिए कोई टेस्ट प्रकाशित नहीं हुआ है।</div>}</div></>}
  {page==='myresults'&&role==='student'&&<><PageTitle title="My Results" sub="आपके प्रकाशित टेस्ट रिजल्ट"/><ResultList rows={results} tests={tests} pdf={pdf} share={share}/></>}
  {page==='performance'&&role==='student'&&<><PageTitle title="My Performance" sub="आपकी टेस्ट प्रगति"/><div className="panel chart"><ResponsiveContainer width="100%" height={260}><LineChart data={[...results].reverse().map(r=>({name:tests.find(x=>x.id===r.testId)?.testName||'Test',percentage:r.percentage}))}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name"/><YAxis domain={[0,100]}/><Tooltip/><Line type="monotone" dataKey="percentage" stroke="#2563eb" strokeWidth={3}/></LineChart></ResponsiveContainer></div></>}
  {page==='attendance'&&<><PageTitle title="Attendance" sub="दैनिक उपस्थिति रिकॉर्ड"/>{role==='admin'?<div className="panel"><form onSubmit={markAttendance}><Select label="क्लास चुनें" value={selectedAttendanceClass} onChange={e=>setSelectedAttendanceClass(e.target.value)}>{classes.map(c=><option key={c}>{c}</option>)}</Select><p className="hint">केवल {selectedAttendanceClass} के Active विद्यार्थी दिखेंगे।</p><Field label="Date" type="date" value={form.attDate||dateKey()} onChange={e=>setForm({...form,attDate:e.target.value})}/>{students.filter(s=>s.status==='Active'&&normalizeClass(s.className||'12th')===normalizeClass(selectedAttendanceClass)).map(s=><div className="attrow" key={s.id}><span>{s.fullName} ({s.rollNumber})</span><select value={form[`att_${s.id}`]||'Present'} onChange={e=>setForm({...form,[`att_${s.id}`]:e.target.value})}><option>Present</option><option>Absent</option></select></div>)}{students.filter(s=>s.status==='Active'&&normalizeClass(s.className||'12th')===normalizeClass(selectedAttendanceClass)).length===0&&<div className="empty">इस क्लास में अभी कोई Active विद्यार्थी नहीं है।</div>}<Button type="submit" disabled={busy||students.filter(s=>s.status==='Active'&&normalizeClass(s.className||'12th')===normalizeClass(selectedAttendanceClass)).length===0}>{busy?'सेव हो रहा है...':'Save Attendance'}</Button></form></div>:<div className="panel"><h3>मेरी Attendance</h3><div className="stats"><div className="stat"><small>कुल दिन</small><strong>{attendance.length}</strong></div><div className="stat"><small>Present</small><strong>{attendance.filter(a=>a.status==='Present').length}</strong></div><div className="stat"><small>Absent</small><strong>{attendance.filter(a=>a.status==='Absent').length}</strong></div><div className="stat"><small>उपस्थिति</small><strong>{attendance.length?Math.round(attendance.filter(a=>a.status==='Present').length/attendance.length*100):0}%</strong></div></div><h3>दैनिक Attendance रिकॉर्ड</h3>{attendance.length?<div className="tablewrap"><table><thead><tr><th>तारीख</th><th>क्लास</th><th>स्थिति</th></tr></thead><tbody>{attendance.map(a=><tr key={a.id}><td>{a.date||'-'}</td><td>{a.className||myStudent?.className||'-'}</td><td><span className={`pill ${a.status==='Present'?'good':'bad'}`}>{a.status||'Not Marked'}</span></td></tr>)}</tbody></table></div>:<div className="empty">अभी आपकी Attendance दर्ज नहीं हुई है। Admin के Attendance सेव करते ही यहाँ दिखाई देगी।</div>}<p className="hint">Attendance पेज खोलने पर रिकॉर्ड फिर से अपडेट होकर लोड होता है।</p></div>}</>}
  {page==='notices'&&<><PageTitle title="Notice Board" sub="कोचिंग की नई सूचनाएँ"/>{role==='admin'&&<div className="panel"><h3>Add Notice</h3><form className="formgrid" onSubmit={addNotice}><Field label="Title (optional)" value={empty(form.title)} onChange={e=>setForm({...form,title:e.target.value})}/><Select label="Category" value={form.category||'General'} onChange={e=>setForm({...form,category:e.target.value})}><option>General</option><option>Holiday</option><option>Exam</option><option>Fee</option><option>Urgent</option></Select><label className="field full"><span>Message (optional)</span><textarea value={empty(form.description)} onChange={e=>setForm({...form,description:e.target.value})}/></label><Field label="Expiry Date (optional)" type="date" min={dateKey()} value={form.expiryDate||''} onChange={e=>setForm({...form,expiryDate:e.target.value})}/><label className="field full"><span>Notice Image / Banner</span><input type="file" accept="image/*" onChange={async e=>{try{const v=await imageToDataUrl(e.target.files?.[0]);setForm(x=>({...x,noticeImage:v}))}catch(err){say(err.message,true)}}}/></label>{form.noticeImage&&<img className="notice-preview" src={form.noticeImage} alt="Notice preview"/>}<Button type="submit" disabled={busy}>{busy?'प्रकाशित हो रहा है...':'Publish Notice'}</Button></form></div>}<div className="panel"><NoticeList rows={notices} isAdmin={role==='admin'} onDelete={setNoticeToDelete} onImageClick={setNoticeImageOpen}/></div></>}
  {page==='backup'&&role==='admin'&&<><PageTitle title="Backup & Restore" sub="अपने डेटा की सुरक्षित JSON कॉपी डाउनलोड करें"/><div className="panel"><p>यह Backup केवल ऐप में लोड किए गए डेटा का JSON Export करता है। इसे नियमित रूप से डाउनलोड करके सुरक्षित जगह रखें।</p><Button onClick={downloadBackup}><Download size={16}/> Download JSON Backup</Button><p className="hint">यह Authentication अकाउंट या Password का Backup नहीं है।</p></div><div className="panel"><h3>Temporary Sale Preparation Tool</h3><p>Demo या पुराने रिकॉर्ड हटाकर वेबसाइट को नए खरीदार के लिए खाली करें। यह Students, Tests, Results, Attendance, Student Credentials और Public Leaderboard हटाएगा। Admin account, Notices और Website Settings सुरक्षित रहेंगे।</p><p className="hint">Student Firebase Authentication accounts डिलीट नहीं होंगे; उनके पोर्टल प्रोफाइल निष्क्रिय किए जाएँगे। यह कार्रवाई वापस नहीं की जा सकती।</p><Button kind="danger" disabled={busy} onClick={resetDemoData}>{busy?'Reset चल रहा है...':'Reset Demo Data (Temporary)'}</Button></div></>}
  </div></main>
    {noticeToDelete&&<div className="dialog-backdrop"><div className="confirm-dialog" role="dialog" aria-modal="true"><h3>Notice हटाएँ?</h3><p>क्या आप सच में यह notice हटाना चाहते हैं?</p><div className="dialog-actions"><Button kind="soft" disabled={busy} onClick={()=>setNoticeToDelete(null)}>रद्द करो</Button><Button kind="danger" disabled={busy} onClick={()=>deleteNotice(noticeToDelete)}>{busy?'हटाया जा रहा है...':'हाँ, हटाओ'}</Button></div></div></div>}
    {noticeImageOpen&&<div className="image-lightbox" onClick={()=>setNoticeImageOpen('')}><button className="lightbox-close" aria-label="Close image" onClick={()=>setNoticeImageOpen('')}>×</button><img src={noticeImageOpen} alt="Notice enlarged" onClick={e=>e.stopPropagation()}/></div>}
  </div>
}

function PageTitle({title,sub}){return <div className="pagetitle"><h1>{title}</h1><p>{sub}</p></div>}
function ResultList({rows,tests,pdf,share}){if(!rows.length)return <div className="empty">अभी कोई रिजल्ट उपलब्ध नहीं है।</div>;return <div className="tablewrap"><table><thead><tr><th>Test</th><th>Marks</th><th>%</th><th>Status</th><th>Rank</th><th>Actions</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{tests.find(t=>t.id===r.testId)?.testName||'Test'}</td><td>{r.obtainedMarks}/{r.totalMarks}</td><td>{r.percentage}%</td><td><span className={`pill ${r.resultStatus==='PASS'?'good':r.resultStatus==='FAIL'?'bad':''}`}>{r.resultStatus}</span></td><td>{r.rank??'-'}</td><td><div className="actions"><button className="tiny" onClick={()=>pdf(r)} title="PDF"><Download size={15}/></button><button className="tiny" onClick={()=>share(r)} title="WhatsApp"><Share2 size={15}/></button></div></td></tr>)}</tbody></table></div>}
function NoticeList({rows,isAdmin=false,onDelete=()=>{},onImageClick=()=>{}}){
  const [expanded,setExpanded]=useState({})
  const sorted=[...rows].sort((a,b)=>{
    const stamp=v=>v?.toDate?v.toDate().getTime():v?.seconds?v.seconds*1000:(v?new Date(v).getTime():0)
    return stamp(b.createdAt)-stamp(a.createdAt)
  })
  if(!sorted.length)return <div className="notice-empty"><span>📭</span><strong>अभी कोई सूचना नहीं है</strong><small>नई सूचनाएँ यहाँ दिखाई देंगी।</small></div>
  const categories={Holiday:{emoji:'🎉',label:'Holiday',tone:'holiday'},General:{emoji:'📢',label:'General',tone:'general'},Exam:{emoji:'📝',label:'Exam',tone:'exam'},Test:{emoji:'📝',label:'Exam',tone:'exam'},Fee:{emoji:'💰',label:'Fee',tone:'fee'},Urgent:{emoji:'🚨',label:'Urgent',tone:'urgent'},Result:{emoji:'🏆',label:'Result',tone:'result'}}
  const getDate=raw=>raw?.toDate?raw.toDate():raw?.seconds?new Date(raw.seconds*1000):(raw?new Date(raw):null)
  const relative=raw=>{const d=getDate(raw);if(!d||Number.isNaN(d.getTime()))return 'तारीख उपलब्ध नहीं';const days=Math.floor((new Date().setHours(0,0,0,0)-new Date(d).setHours(0,0,0,0))/86400000);if(days<=0)return 'आज';if(days===1)return 'कल';return days+' दिन पहले'}
  return <div className="notice-card-list">{sorted.map(n=>{
    const cat=categories[n.category]||categories.General
    const created=getDate(n.createdAt)
    const isNew=created&&!Number.isNaN(created.getTime())&&(Date.now()-created.getTime()<86400000)
    const message=n.description||'',long=message.length>220,open=!!expanded[n.id]
    return <article className={'notice-card tone-'+cat.tone} key={n.id}>
      <div className="notice-card-top"><span className="notice-category">{cat.emoji} {cat.label}</span>{isNew&&<span className="notice-new">NEW</span>}</div>
      {n.title&&<div className="notice-card-heading"><span className="notice-heading-kicker">SHIV COACHING CENTER · NOTICE</span><h3>{n.title}</h3></div>}
      {n.imageData&&<button type="button" className="notice-image-button" onClick={()=>onImageClick(n.imageData)} aria-label="इमेज बड़ी करके देखें"><img className="notice-card-image" src={n.imageData} alt={n.title||'Notice image'}/><span className="notice-image-hint">इमेज देखने के लिए टैप करें</span></button>}
      {message&&<div className={'notice-message '+(long&&!open?'notice-message-clamp':'')}>{message}</div>}
      {long&&<button type="button" className="read-more" onClick={()=>setExpanded(v=>({...v,[n.id]:!v[n.id]}))}>{open?'कम पढ़ें':'और पढ़ें'}</button>}
      <div className="notice-card-footer"><span>🗓️ {relative(n.createdAt)}{created&&!Number.isNaN(created.getTime())?' · '+created.toLocaleDateString('hi-IN',{day:'numeric',month:'short',year:'numeric'}):''}</span>{isAdmin&&<button type="button" className="notice-delete" onClick={()=>onDelete(n)}>🗑️ Delete</button>}</div>
    </article>
  })}</div>
}
