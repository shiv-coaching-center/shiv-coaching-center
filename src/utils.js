export const studentAuthEmail = (roll) => {
  const clean = String(roll || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '')
  if (!clean) throw new Error('वैध Roll Number दर्ज करें।')
  return `${clean}@student.shivcoachingcenter.com`
}
export const pct = (marks, total) => total > 0 ? Math.round((marks / total) * 10000) / 100 : 0
export const resultStatus = (marks, passing, attendance) => attendance === 'Absent' ? 'ABSENT' : Number(marks) >= Number(passing) ? 'PASS' : 'FAIL'
export const rankRows = (rows) => {
  const sorted = [...rows].filter(x => x.attendance !== 'Absent').sort((a,b) => Number(b.obtainedMarks)-Number(a.obtainedMarks))
  let previous = null, rank = 0
  return sorted.map((r, i) => {
    if (previous === null || Number(r.obtainedMarks) !== previous) rank = i + 1
    previous = Number(r.obtainedMarks)
    return {...r, rank}
  })
}
export const dateKey = (d = new Date()) => {
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0')
  return `${y}-${m}-${day}`
}