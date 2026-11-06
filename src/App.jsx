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
  const [students,setStudents]=useState([]), [tests,setTests]=useState([]), [results,setResults]=useState([]), [notices,setNotices]=useState([]), [attendance,setAttendance]=useState([]), [credentials,setCredentials]=useState([]), [branding,setBranding]=useState(null)
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

  useEffect(()=>{ if(user && role) loadData() },[user,role])

  async function loadData(){
    try {
      if(role==='admin'){
        const [s,ts,rs,ns,at,cs,bs]=await Promise.all([
          getDocs(collection(db,'students')),getDocs(collection(db,'tests')),getDocs(collection(db,'results')),getDocs(collection(db,'notices')),getDocs(collection(db,'attendance')),getDocs(collection(db,'studentCredentials')),getDoc(doc(db,'settings','branding'))
        ])
        setStudents(s.docs.map(d=>({...d.data(),id:d.id})));setTests(ts.docs.map(d=>({...d.data(),id:d.id})));setResults(rs.docs.map(d=>({...d.data(),id:d.id})));setNotices(ns.docs.map(d=>({...d.data(),id:d.id})));setAttendance(at.docs.map(d=>({...d.data(),id:d.id})));setCredentials(cs.docs.map(d=>({...d.data(),id:d.id})));setBranding(bs.exists()?bs.data():null)
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
            getDocs(query(collection(db,'tests'),where('status','==','Published')))
          ])
          setResults(rs.docs.map(d=>({...d.data(),id:d.id})));setAttendance(at.docs.map(d=>({...d.data(),id:d.id})));setNotices(ns.docs.map(d=>({...d.data(),id:d.id})));setTests(ts.docs.map(d=>({...d.data(),id:d.id})))
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
  async function addStudent(e){
    e.preventDefault()
    if(!auth || !db || !studentAuth){say('Firebase Authentication तैयार नहीं है। कनेक्शन जाँचें।',true);return}
    setBusy(true);setNewStudentCredentials(null)
    let createdUser=null
    try{
      const r=String(form.rollNumber||'').trim()
      const normalizedRoll=r.toLowerCase()
      if(!r) throw new Error('Roll Number दर्ज करें।')
      if(!String(form.fullName||'').trim()) throw new Error('स्टूडेंट का नाम दर्ज करें।')
      if(students.some(s=>String(s.rollNumber||'').trim().toLowerCase()===normalizedRoll)) throw new Error('यह Roll Number पहले से मौजूद है।')
      const existing=await getDocs(query(collection(db,'students'),where('rollNumber','==',r)))
      if(!existing.empty) throw new Error('यह Roll Number पहले से मौजूद है।')

      const loginEmail=studentAuthEmail(r)
      const generatedPassword=makeStudentPassword()
      const credential=await createUserWithEmailAndPassword(studentAuth,loginEmail,generatedPassword)
      createdUser=credential.user

      const studentRef=doc(collection(db,'students'))
      const userRef=doc(db,'users',createdUser.uid)
      const batch=writeBatch(db)
      batch.set(studentRef,{fullName:String(form.fullName).trim(),rollNumber:r,className:form.className||'12th',stream:form.stream||'Science',mobileNumber:form.mobileNumber||'',admissionDate:form.admissionDate||dateKey(),status:'Active',accountStatus:'Active',authUid:createdUser.uid,createdAt:serverTimestamp()})
      batch.set(userRef,{role:'student',isActive:true,studentId:studentRef.id,createdAt:serverTimestamp()})
      batch.set(doc(db,'studentCredentials',studentRef.id),{studentId:studentRef.id,authUid:createdUser.uid,fullName:String(form.fullName).trim(),rollNumber:r,loginEmail,password:generatedPassword,createdAt:serverTimestamp()})
      await batch.commit()

      setNewStudentCredentials({name:String(form.fullName).trim(),rollNumber:r,email:loginEmail,password:generatedPassword})
      setForm({});await loadData();say('स्टूडेंट का Login Account सफलतापूर्वक बन गया।')
      await signOut(studentAuth).catch(()=>{})
    }catch(e){
      if(createdUser){
        await deleteUser(createdUser).catch(async()=>{await signOut(studentAuth).catch(()=>{})})
      }
      const errors={
        'auth/email-already-in-use':'इस Roll Number का Login Account पहले से मौजूद है।',
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
      const refs=[...resultDocs.docs,...attendanceDocs.docs, ...(student.authUid?[doc(db,'users',student.authUid)]:[]),doc(db,'studentCredentials',student.id),doc(db,'students',student.id)]
      for(let i=0;i<refs.length;i+=450){
        const batch=writeBatch(db)
        refs.slice(i,i+450).forEach(ref=>batch.delete(ref))
        await batch.commit()
      }
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
    e.preventDefault();setBusy(true)
    try{await addDoc(collection(db,'tests'),{testName:form.testName,testType:form.testType||'Weekly',subject:form.subject||'Physics',className:form.className||'12th',testDate:form.testDate||dateKey(),totalMarks:Number(form.totalMarks),passingMarks:Number(form.passingMarks),description:form.description||'',status:'Draft',createdAt:serverTimestamp()});setForm({});await loadData();say('टेस्ट बन गया।')}
    catch(e){say(e.message,true)}finally{setBusy(false)}
  }
  async function saveMarks(e){
    e.preventDefault();setBusy(true)
    try{
      const test=tests.find(x=>x.id===form.testId);if(!test)throw new Error('टेस्ट चुनें।')
      const batchRows=students.filter(s=>s.status==='Active')
      for(const s of batchRows){
        const raw=form[`m_${s.id}`]
        const att=form[`a_${s.id}`]||'Present'
        if(raw===''||raw===undefined)throw new Error(`${s.fullName} के नंबर भरें या Absent चुनें।`)
        const marks=att==='Absent'?0:Number(raw)
        if(att!=='Absent' && (marks<0||marks>Number(test.totalMarks)))throw new Error(`${s.fullName}: नंबर की सीमा गलत है।`)
        const existing=await getDocs(query(collection(db,'results'),where('testId','==',test.id),where('studentId','==',s.id)))
        const data={testId:test.id,studentId:s.id,studentNameSnapshot:s.fullName,rollNumberSnapshot:s.rollNumber,obtainedMarks:marks,totalMarks:Number(test.totalMarks),passingMarks:Number(test.passingMarks),percentage:att==='Absent'?0:pct(marks,test.totalMarks),attendance:att,resultStatus:resultStatus(marks,test.passingMarks,att),publicationStatus:'Draft',updatedAt:serverTimestamp()}
        if(existing.empty)await addDoc(collection(db,'results'),{...data,createdAt:serverTimestamp()})
        else await updateDoc(doc(db,'results',existing.docs[0].id),data)
      }
      await updateDoc(doc(db,'tests',test.id),{status:'Completed'})
      await loadData();say('सभी नंबर Draft में सेव हो गए। Publish करने से पहले जाँचें।')
    }catch(e){say(e.message,true)}finally{setBusy(false)}
  }
  async function publish(testId,status){
    setBusy(true)
    try{
      const rows=results.filter(r=>r.testId===testId)
      const ranked=rankRows(rows)
      for(const r of rows){
        const rank=ranked.find(x=>x.id===r.id)?.rank ?? null
        await updateDoc(doc(db,'results',r.id),{rank,publicationStatus:status,updatedAt:serverTimestamp()})
      }
      await updateDoc(doc(db,'tests',testId),{status:status==='Published'?'Published':'Completed'})
      await loadData();say(status==='Published'?'रिजल्ट प्रकाशित हो गया।':'रिजल्ट Unpublish हो गया।')
    }catch(e){say('Publish नहीं हुआ: '+e.message,true)}finally{setBusy(false)}
  }
  async function markAttendance(e){
    e.preventDefault();setBusy(true)
    try{
      const date=form.attDate||dateKey()
      for(const s of students.filter(x=>x.status==='Active')){
        const id=`${date}_${s.id}`
        await setDoc(doc(db,'attendance',id),{studentId:s.id,studentName:s.fullName,rollNumber:s.rollNumber,date,status:form[`att_${s.id}`]||'Present',createdAt:serverTimestamp()},{merge:true})
      }
      await loadData();say('Attendance सेव हो गई।')
    }catch(e){say(e.message,true)}finally{setBusy(false)}
  }
  async function addNotice(e){
    e.preventDefault();if(!String(form.title||'').trim()&&!form.noticeImage){say('शीर्षक या इमेज में से कम-से-कम एक जोड़ें।',true);return}
    try{await addDoc(collection(db,'notices'),{title:form.title||'',description:form.description||'',imageData:form.noticeImage||'',category:form.category||'General',status:'Published',visibility:'Students',createdAt:serverTimestamp(),expiryDate:form.expiryDate||''});setForm({});await loadData();say('Notice प्रकाशित हो गया।')}catch(e){say(e.message,true)}
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
  const avg=results.length?Math.round(results.reduce((a,r)=>a+Number(r.percentage||0),0)/results.length):0
  const nav=role==='admin'?[
    ['dashboard','Dashboard',LayoutDashboard],['students','Students',Users],['deletedstudents','Deleted Students',Trash2],['tests','Tests',ClipboardList],['marks','Marks Entry',BookOpen],['results','Results',Trophy],['attendance','Attendance',CalendarCheck],['notices','Notices',Bell],['backup','Backup',Download]
  ]:[['dashboard','Dashboard',LayoutDashboard],['myresults','My Results',Trophy],['performance','Performance',ChartNoAxesCombined],['attendance','My Attendance',CalendarCheck],['notices','Notice Board',Bell]]

  if(!firebaseConfigured)return <div className="setup"><div className="brandmark"><GraduationCap size={34}/></div><h1>{BRAND}</h1><h2>Firebase Setup Required</h2><p>यह प्रोजेक्ट तैयार है, लेकिन Firebase की जानकारी अभी जोड़ी नहीं गई है।</p><p><b>अगला कदम:</b> Firebase Console में Web App बनाएँ और README में दिए गए निर्देशों के अनुसार .env फ़ाइल में Firebase Config भरें।</p><div className="setupbox">VITE_FIREBASE_API_KEY<br/>VITE_FIREBASE_AUTH_DOMAIN<br/>VITE_FIREBASE_PROJECT_ID<br/>VITE_FIREBASE_APP_ID</div><small>बिना Firebase Configuration के Login और Database काम नहीं करेंगे।</small></div>

  if(authLoading)return <div className="setup"><div className="brandmark"><GraduationCap size={34}/></div><h2>लोड हो रहा है...</h2><p>Firebase अकाउंट की जाँच की जा रही है।</p></div>

  if(!user)return <div className="loginpage"><div className="loginhero"><div className="brandmark"><GraduationCap size={36}/></div><h1>{BRAND}</h1><p>ज्ञान • अनुशासन • सफलता</p></div><div className="loginbox"><h2>{t('पोर्टल में लॉगिन करें','Portal Login')}</h2><Notice message={message} error={error}/><div className="tabs"><button type="button" className={role!=='student'?'active':''} onClick={()=>{setRole('admin');setMessage('')}}>Admin</button><button type="button" className={role==='student'?'active':''} onClick={()=>{setRole('student');setMessage('')}}>Student</button></div><form onSubmit={login}>{role==='student'?<Field label="Roll Number" value={roll} onChange={e=>setRoll(e.target.value)} required placeholder="जैसे 12001"/>:<Field label="Admin Email" type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="Admin Email"/>}<Field label="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} required placeholder="Password"/><Button type="submit" disabled={busy}>{busy?'Please wait...':'Login'}</Button></form><p className="hint">Student password भूलने पर Coaching Admin से संपर्क करें।</p></div></div>

  return <div className="app">{menu&&<button className="menu-backdrop" aria-label="Close menu" onClick={()=>setMenu(false)}/>}<aside className={menu?'sidebar open':'sidebar'}><div className="sidebrand"><div className="brandmark"><GraduationCap/></div><div><b>SHIV COACHING</b><small>CENTER PORTAL</small></div><button className="menu-close mobileonly" aria-label="Close menu" onClick={()=>setMenu(false)}><X/></button></div><div className="navlabel">{role==='admin'?'ADMIN MENU':'STUDENT MENU'}</div>{nav.map(([id,label,Icon])=><button key={id} className={`navitem ${page===id?'selected':''}`} onClick={()=>{setPage(id);setMenu(false)}}><Icon size={18}/>{label}</button>)}<div className="sidebottom"><button className="navitem" onClick={()=>setDark(!dark)}>{dark?<Sun size={18}/>:<Moon size={18}/>} {dark?'Light Mode':'Dark Mode'}</button><button className="navitem" onClick={()=>setLang(lang==='hi'?'en':'hi')}>文 {lang==='hi'?'English':'हिन्दी'}</button><button className="navitem" onClick={logout}><LogOut size={18}/> Logout</button></div></aside><main className="main"><header className="topbar"><button className="iconbtn mobileonly" onClick={()=>setMenu(!menu)}><Menu/></button><div><b>{BRAND}</b><small>{role==='admin'?'Administrator':'Student Portal'}</small></div><button className="iconbtn" onClick={()=>setDark(!dark)}>{dark?<Sun/>:<Moon/>}</button></header><div className="content"><Notice message={message} error={error}/>{page==='dashboard'&&<><div className="welcome dashboard-brand" style={branding?.imageData?{backgroundImage:`linear-gradient(90deg,rgba(16,42,86,.88),rgba(16,42,86,.35)),url(${branding.imageData})`}:{}}><div><span className="eyebrow">WELCOME BACK</span><h1>{role==='admin'?(branding?.title||'Admin Dashboard'):`नमस्ते, ${myStudent?.fullName||'Student'}!`}</h1><p>{branding?.subtitle||'आपके कोचिंग सेंटर का पूरा अकादमिक रिकॉर्ड एक जगह।'}</p></div><div className="datepill">{dateKey()}</div></div>
  {role==='admin'&&<div className="panel compact-brand"><h3>Dashboard Branding</h3><form className="formgrid" onSubmit={saveBranding}><Field label="Title" value={form.brandTitle??branding?.title??BRAND} onChange={e=>setForm({...form,brandTitle:e.target.value})}/><Field label="Subtitle" value={form.brandSubtitle??branding?.subtitle??'ज्ञान • अनुशासन • सफलता'} onChange={e=>setForm({...form,brandSubtitle:e.target.value})}/><label className="field full"><span>Logo / Banner Image</span><input type="file" accept="image/*" onChange={async e=>{try{const v=await imageToDataUrl(e.target.files?.[0],1400);setForm(x=>({...x,brandImage:v}))}catch(err){say(err.message,true)}}}/></label>{(form.brandImage||branding?.imageData)&&<img className="brand-preview" src={form.brandImage||branding.imageData} alt="Brand preview"/>}<div className="full"><Button type="submit" disabled={busy}>Save Branding</Button></div></form></div>}<div className="stats">{(role==='admin'?[['Total Students',students.filter(s=>s.status!=='Deleted').length],['Total Tests',tests.length],['Published Results',results.filter(r=>r.publicationStatus==='Published').length],['Average',`${avg}%`]]:[['My Tests',tests.length],['Average',`${avg}%`],['Attendance',`${attendance.length?Math.round(attendance.filter(a=>a.status==='Present').length/attendance.length*100):0}%`],['Notices',notices.length]]).map(([a,b])=><div className="stat" key={a}><small>{a}</small><strong>{b}</strong></div>)}</div><div className="panel"><h3>{role==='admin'?'Quick Actions':'Recent Results'}</h3>{role==='admin'?<div className="quick">{[['students','Add Student'],['tests','Create Test'],['marks','Enter Marks'],['attendance','Mark Attendance'],['notices','Add Notice']].map(([p,l])=><Button key={p} kind="soft" onClick={()=>setPage(p)}><Plus size={16}/>{l}</Button>)}</div>:<ResultList rows={results} tests={tests} pdf={pdf} share={share}/>}</div><div className="panel"><h3>Latest Notices</h3><NoticeList rows={notices}/></div></>}
  {page==='students'&&role==='admin'&&<><PageTitle title="Student Management" sub="विद्यार्थियों का रिकॉर्ड जोड़ें और मैनेज करें"/><div className="panel"><h3>Add Student</h3><form className="formgrid" onSubmit={addStudent}><Field label="Full Name" value={empty(form.fullName)} onChange={e=>setForm({...form,fullName:e.target.value})} required/><Field label="Roll Number" value={empty(form.rollNumber)} onChange={e=>setForm({...form,rollNumber:e.target.value})} required/><Select label="Class" value={form.className||'12th'} onChange={e=>setForm({...form,className:e.target.value})}><option>12th</option><option>11th</option><option>10th</option><option>9th</option></Select><Select label="Stream" value={form.stream||'Science'} onChange={e=>setForm({...form,stream:e.target.value})}><option>Science</option><option>Arts</option><option>Commerce</option></Select><Field label="Mobile Number" value={empty(form.mobileNumber)} onChange={e=>setForm({...form,mobileNumber:e.target.value})}/><Field label="Admission Date" type="date" value={form.admissionDate||dateKey()} onChange={e=>setForm({...form,admissionDate:e.target.value})}/><div className="full"><Button type="submit" disabled={busy}>{busy?'Account बनाया जा रहा है...':'Create Student Account'}</Button></div></form></div>{newStudentCredentials&&<div className="panel"><div className="panelhead"><h3>स्टूडेंट का Login तैयार है</h3><Button kind="soft" onClick={()=>setNewStudentCredentials(null)}>बंद करें</Button></div><p><b>नाम:</b> {newStudentCredentials.name}</p><p><b>Roll Number:</b> {newStudentCredentials.rollNumber}</p><p><b>Login ID:</b> <code>{newStudentCredentials.email}</code></p><Button kind="soft" onClick={()=>copyCredential(newStudentCredentials.email,'Login ID')}>Copy Login ID</Button><p><b>Password:</b> <code>{newStudentCredentials.password}</code></p><Button kind="soft" onClick={()=>copyCredential(newStudentCredentials.password,'Password')}>Copy Password</Button><p className="hint">यह पासवर्ड केवल अभी दिखाया जा रहा है। इसे स्टूडेंट को सुरक्षित तरीके से दे दें। इस पैनल को बंद करने के बाद पासवर्ड दोबारा नहीं दिखेगा।</p></div>}<div className="panel"><div className="panelhead"><h3>Student List ({students.filter(s=>s.status!=='Deleted').length})</h3><div className="search"><Search size={16}/><input placeholder="Search name / roll" value={search} onChange={e=>setSearch(e.target.value)}/></div></div><div className="tablewrap"><table><thead><tr><th>Name</th><th>Roll</th><th>Class</th><th>Account</th><th>Status</th><th>Action</th></tr></thead><tbody>{students.filter(s=>s.status!=='Deleted'&&(s.fullName+' '+s.rollNumber).toLowerCase().includes(search.toLowerCase())).map(s=><tr key={s.id}><td>{s.fullName}</td><td>{s.rollNumber}</td><td>{s.className}</td><td>{s.accountStatus||'Pending'}</td><td>{s.status}</td><td><Button kind="danger" disabled={busy} onClick={()=>deleteStudentAccount(s)}><Trash2 size={14}/> Delete</Button></td></tr>)}</tbody></table></div><div className="panel"><h3>Student Login Credentials (Admin Only)</h3><div className="tablewrap"><table><thead><tr><th>Name</th><th>Roll</th><th>Login ID</th><th>Password</th></tr></thead><tbody>{credentials.map(x=><tr key={x.id}><td>{x.fullName}</td><td>{x.rollNumber}</td><td><code>{x.loginEmail}</code> <button className="tiny" onClick={()=>copyCredential(x.loginEmail,'Login ID')}>Copy</button></td><td><code>{x.password}</code> <button className="tiny" onClick={()=>copyCredential(x.password,'Password')}>Copy</button></td></tr>)}</tbody></table></div><p className="hint">पासवर्ड अलग Admin-only Firestore संग्रह में सेव है। इसे निजी रखें।</p></div></div></>}
  {page==='deletedstudents'&&role==='admin'&&<><PageTitle title="Deleted Students" sub="यहाँ केवल हटाए गए विद्यार्थी दिखाई देंगे"/><div className="panel"><div className="panelhead"><h3>Deleted Student List ({students.filter(s=>s.status==='Deleted').length})</h3><div className="search"><Search size={16}/><input placeholder="Search name / roll" value={search} onChange={e=>setSearch(e.target.value)}/></div></div><div className="tablewrap"><table><thead><tr><th>Name</th><th>Roll</th><th>Class</th><th>Action</th></tr></thead><tbody>{students.filter(s=>s.status==='Deleted'&&(s.fullName+' '+s.rollNumber).toLowerCase().includes(search.toLowerCase())).map(s=><tr key={s.id}><td>{s.fullName}</td><td>{s.rollNumber}</td><td>{s.className}</td><td><Button kind="danger" disabled={busy} onClick={()=>permanentlyDeleteStudent(s)}><Trash2 size={14}/> Permanent Delete</Button></td></tr>)}</tbody></table></div>{students.every(s=>s.status!=='Deleted')&&<p className="empty">अभी कोई Deleted Student नहीं है।</p>}<p className="hint">Permanent Delete करने पर Student, User Profile, Results और Attendance रिकॉर्ड हटेंगे। Firebase Authentication का मूल अकाउंट फ्रंटएंड से स्थायी रूप से नहीं मिटाया जा सकता; User Profile हटने पर पोर्टल लॉगिन ब्लॉक रहेगा।</p></div></>}
  {page==='tests'&&role==='admin'&&<><PageTitle title="Test Management" sub="Weekly, Monthly और Subject-wise Tests"/><div className="panel"><h3>Create New Test</h3><form className="formgrid" onSubmit={addTest}><Field label="Test Name" value={empty(form.testName)} onChange={e=>setForm({...form,testName:e.target.value})} required/><Select label="Test Type" value={form.testType||'Weekly'} onChange={e=>setForm({...form,testType:e.target.value})}><option>Weekly</option><option>Monthly</option><option>Subject-wise</option></Select><Select label="Subject" value={form.subject||'Physics'} onChange={e=>setForm({...form,subject:e.target.value})}>{['Physics','Chemistry','Mathematics','Biology','English','Hindi'].map(x=><option key={x}>{x}</option>)}</Select><Field label="Test Date" type="date" value={form.testDate||dateKey()} onChange={e=>setForm({...form,testDate:e.target.value})}/><Field label="Total Marks" type="number" min="1" value={empty(form.totalMarks)} onChange={e=>setForm({...form,totalMarks:e.target.value})} required/><Field label="Passing Marks" type="number" min="0" value={empty(form.passingMarks)} onChange={e=>setForm({...form,passingMarks:e.target.value})} required/><div className="full"><Button type="submit" disabled={busy}>Create Test</Button></div></form></div><div className="panel"><h3>All Tests</h3><div className="tablewrap"><table><thead><tr><th>Test</th><th>Subject</th><th>Date</th><th>Marks</th><th>Status</th><th>Action</th></tr></thead><tbody>{tests.map(x=><tr key={x.id}><td>{x.testName}</td><td>{x.subject}</td><td>{x.testDate}</td><td>{x.totalMarks}</td><td>{x.status}</td><td><Button kind="danger" disabled={busy} onClick={()=>deleteTest(x)}><Trash2 size={14}/> Delete Test</Button></td></tr>)}</tbody></table></div></div></>}
  {page==='marks'&&role==='admin'&&<><PageTitle title="Marks Entry" sub="एक टेस्ट चुनें और सभी विद्यार्थियों के नंबर भरें"/><div className="panel"><Select label="Select Test" value={form.testId||''} onChange={e=>setForm({...form,testId:e.target.value})}><option value="">Choose test</option>{tests.map(x=><option value={x.id} key={x.id}>{x.testName} · {x.subject}</option>)}</Select><form onSubmit={saveMarks}><div className="tablewrap"><table><thead><tr><th>Student</th><th>Marks</th><th>Attendance</th></tr></thead><tbody>{students.filter(s=>s.status==='Active').map(s=><tr key={s.id}><td>{s.fullName}<small className="block">{s.rollNumber}</small></td><td><input className="markinput" type="number" min="0" value={form[`m_${s.id}`]??''} onChange={e=>setForm({...form,[`m_${s.id}`]:e.target.value})}/></td><td><select value={form[`a_${s.id}`]||'Present'} onChange={e=>setForm({...form,[`a_${s.id}`]:e.target.value})}><option>Present</option><option>Absent</option></select></td></tr>)}</tbody></table></div><Button type="submit" disabled={busy||!form.testId}>Save Marks as Draft</Button></form></div></>}
  {page==='results'&&role==='admin'&&<><PageTitle title="Result Management" sub="रिजल्ट जाँचें, प्रकाशित या Unpublish करें"/>{tests.map(test=><div className="panel" key={test.id}><div className="panelhead"><div><h3>{test.testName}</h3><small>{test.subject} · {test.testDate} · {test.totalMarks} Marks</small></div><div className="actions"><Button kind="soft" onClick={()=>publish(test.id,'Published')}>Publish</Button><Button kind="danger" onClick={()=>publish(test.id,'Draft')}>Unpublish</Button></div></div><ResultList rows={results.filter(r=>r.testId===test.id)} tests={tests} pdf={pdf} share={share}/></div>)}</>}
  {page==='myresults'&&role==='student'&&<><PageTitle title="My Results" sub="आपके प्रकाशित टेस्ट रिजल्ट"/><ResultList rows={results} tests={tests} pdf={pdf} share={share}/></>}
  {page==='performance'&&role==='student'&&<><PageTitle title="My Performance" sub="आपकी टेस्ट प्रगति"/><div className="panel chart"><ResponsiveContainer width="100%" height={260}><LineChart data={[...results].reverse().map(r=>({name:tests.find(x=>x.id===r.testId)?.testName||'Test',percentage:r.percentage}))}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name"/><YAxis domain={[0,100]}/><Tooltip/><Line type="monotone" dataKey="percentage" stroke="#2563eb" strokeWidth={3}/></LineChart></ResponsiveContainer></div></>}
  {page==='attendance'&&<><PageTitle title="Attendance" sub="दैनिक उपस्थिति रिकॉर्ड"/>{role==='admin'?<div className="panel"><form onSubmit={markAttendance}><Field label="Date" type="date" value={form.attDate||dateKey()} onChange={e=>setForm({...form,attDate:e.target.value})}/>{students.filter(s=>s.status==='Active').map(s=><div className="attrow" key={s.id}><span>{s.fullName} ({s.rollNumber})</span><select value={form[`att_${s.id}`]||'Present'} onChange={e=>setForm({...form,[`att_${s.id}`]:e.target.value})}><option>Present</option><option>Absent</option></select></div>)}<Button type="submit">Save Attendance</Button></form></div>:<div className="panel"><p>Total Classes: {attendance.length}</p><p>Present: {attendance.filter(a=>a.status==='Present').length}</p><p>Absent: {attendance.filter(a=>a.status==='Absent').length}</p><p>Attendance: {attendance.length?Math.round(attendance.filter(a=>a.status==='Present').length/attendance.length*100):0}%</p></div>}</>}
  {page==='notices'&&<><PageTitle title="Notice Board" sub="कोचिंग की नई सूचनाएँ"/>{role==='admin'&&<div className="panel"><h3>Add Notice</h3><form className="formgrid" onSubmit={addNotice}><Field label="Title" value={empty(form.title)} onChange={e=>setForm({...form,title:e.target.value})} required/><Select label="Category" value={form.category||'General'} onChange={e=>setForm({...form,category:e.target.value})}><option>General</option><option>Test</option><option>Holiday</option><option>Result</option></Select><label className="field full"><span>Description (optional)</span><textarea value={empty(form.description)} onChange={e=>setForm({...form,description:e.target.value})}/></label><label className="field full"><span>Notice Image / Banner</span><input type="file" accept="image/*" onChange={async e=>{try{const v=await imageToDataUrl(e.target.files?.[0]);setForm(x=>({...x,noticeImage:v}))}catch(err){say(err.message,true)}}}/></label>{form.noticeImage&&<img className="notice-preview" src={form.noticeImage} alt="Notice preview"/>}<Button type="submit">Publish Notice</Button></form></div>}<div className="panel"><NoticeList rows={notices}/></div></>}
  {page==='backup'&&role==='admin'&&<><PageTitle title="Backup & Restore" sub="अपने डेटा की सुरक्षित JSON कॉपी डाउनलोड करें"/><div className="panel"><p>यह Backup केवल ऐप में लोड किए गए डेटा का JSON Export करता है। इसे नियमित रूप से डाउनलोड करके सुरक्षित जगह रखें।</p><Button onClick={downloadBackup}><Download size={16}/> Download JSON Backup</Button><p className="hint">यह Authentication अकाउंट या Password का Backup नहीं है।</p></div></>}
  </div></main></div>
}

function PageTitle({title,sub}){return <div className="pagetitle"><h1>{title}</h1><p>{sub}</p></div>}
function ResultList({rows,tests,pdf,share}){if(!rows.length)return <div className="empty">अभी कोई रिजल्ट उपलब्ध नहीं है।</div>;return <div className="tablewrap"><table><thead><tr><th>Test</th><th>Marks</th><th>%</th><th>Status</th><th>Rank</th><th>Actions</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{tests.find(t=>t.id===r.testId)?.testName||'Test'}</td><td>{r.obtainedMarks}/{r.totalMarks}</td><td>{r.percentage}%</td><td><span className={`pill ${r.resultStatus==='PASS'?'good':r.resultStatus==='FAIL'?'bad':''}`}>{r.resultStatus}</span></td><td>{r.rank??'-'}</td><td><div className="actions"><button className="tiny" onClick={()=>pdf(r)} title="PDF"><Download size={15}/></button><button className="tiny" onClick={()=>share(r)} title="WhatsApp"><Share2 size={15}/></button></div></td></tr>)}</tbody></table></div>}
function NoticeList({rows}){if(!rows.length)return <div className="empty">अभी कोई Notice नहीं है।</div>;return rows.map(n=><div className="noticeitem" key={n.id}>{n.title&&<b>{n.title}</b>}<small>{n.category||'General'}</small>{n.imageData&&<img className="notice-image" src={n.imageData} alt={n.title||'Notice image'}/>}{n.description&&<p>{n.description}</p>}</div>)}
