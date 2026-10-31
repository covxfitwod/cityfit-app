import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, setPersistence, browserLocalPersistence } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { getFirestore, doc, getDoc, getDocs, collection, runTransaction, serverTimestamp, query, where, setDoc, deleteDoc } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const config = {
  apiKey: "AIzaSyBJ0b_22RLs1qwkxj8n9A9_EM0ZT3guytE",
  authDomain: "cityfit-workout-app.firebaseapp.com",
  projectId: "cityfit-workout-app",
  storageBucket: "cityfit-workout-app.firebasestorage.app",
  messagingSenderId: "307788439314",
  appId: "1:307788439314:web:8b77fb855b8d7986e19dcb"
};
const selectedConfig = window.CITYFIT_FIREBASE_CONFIG || config;
if (window.CITYFIT_TEST_MODE && (!window.CITYFIT_FIREBASE_CONFIG || selectedConfig.projectId === 'cityfit-workout-app')) {
  throw new Error('Test mode requires a separate Firebase project. Production Firebase is blocked.');
}
const app = getApps()[0] || initializeApp(selectedConfig);
const auth = getAuth(app), db = getFirestore(app);
const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const choices = {
  difficulty: [['too_easy','Too easy'],['about_right','About right'],['too_difficult','Too difficult']],
  duration: [['quicker','Way quicker'],['as_expected','As expected'],['longer','Way longer']],
  completion: [['nearly_all','Nearly everyone completed'],['most_scaled','Most completed with scaling'],['many_scaled','Many needed significant scaling']],
  recommendation: [['keep','Keep'],['progress','Progress'],['modify','Modify'],['replace','Replace']]
};
let currentUser = null, role = 'member', currentReview = null, history = [], state = '', busy = false, seq = 0, admins = [], adminStatus = '';
const root = () => document.querySelector('#main');
const workout = () => window.cityfitReviewContext?.() || {};
const isReviewer = () => role === 'reviewer' || role === 'admin';
const error = e => e?.code === 'permission-denied' || String(e?.code).includes('permission-denied')
  ? 'Firestore access denied. The review rules may not be deployed yet.'
  : e?.message || 'Something went wrong.';
const field = (name, label, value) => `<label class="review-label" for="review-${name}">${label}</label><select class="log-input" id="review-${name}">${choices[name].map(([v,t])=>`<option value="${v}" ${v===value?'selected':''}>${t}</option>`).join('')}</select>`;
const defaultData = {rating:3,difficulty:'about_right',duration:'as_expected',completion:'nearly_all',recommendation:'keep',comments:''};
const dateLabel = date => date ? new Date(date+'T12:00:00Z').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric',timeZone:'UTC'}) : '';
const stamp = value => value?.toDate?.()?.toLocaleString() || 'Pending';
const reviewRef = date => doc(db,'workoutReviews',date);
function setStatus(msg){state=msg;const el=document.querySelector('#review-status');if(el)el.textContent=msg;}
function reviewMarkup(){
  const {date,focus,description} = workout();
  const dates = window.cityfitReviewDates?.() || [];
  const position = dates.indexOf(date);
  const dateNavigation = `<div class="card"><label class="review-label" for="review-date-picker">Scheduled workout</label><div class="log-actions"><button class="btn secondary" id="review-prev" ${position<=0?'disabled':''}>← Previous</button><button class="btn secondary" id="review-next" ${position<0||position>=dates.length-1?'disabled':''}>Next →</button></div><select class="log-input" id="review-date-picker">${dates.map(d=>`<option value="${esc(d)}" ${d===date?'selected':''}>${esc(dateLabel(d))}</option>`).join('')}</select></div>`;
  const v = currentReview || defaultData;
  const canEdit = isReviewer();
  const readonly = currentReview && !canEdit;
  const adminPanel = role !== 'admin' ? '' : `<div class="card"><h2>Reviewer access</h2><p class="muted">Use the Firebase Authentication UID of an existing signed-in member. Never use an email address as the document ID.</p><form id="review-admin-form"><label class="review-label" for="review-role-uid">Firebase user UID</label><input class="log-input" id="review-role-uid" required maxlength="128" placeholder="Firebase Authentication UID"><label class="review-label" for="review-role-email">Email (reference only)</label><input class="log-input" id="review-role-email" type="email" required maxlength="254" placeholder="member@example.com"><label class="review-label" for="review-role-choice">Access level</label><select class="log-input" id="review-role-choice"><option value="reviewer">Reviewer</option><option value="admin">Admin</option></select><button class="btn" type="submit">Grant access</button></form><p class="muted" id="review-admin-status">${esc(adminStatus)}</p><div id="review-admin-list">${admins.map(a=>`<div class="log-entry"><strong>${esc(a.email)}</strong> · ${esc(a.role)}<div class="meta">${esc(a.uid)}</div><button class="btn secondary" data-revoke="${esc(a.uid)}" ${a.uid===currentUser?.uid?'disabled':''}>Revoke access</button></div>`).join('')}</div></div>`;
  const form = !canEdit ? '' : `<form id="review-form">
    <label class="review-label" for="review-rating">Overall workout quality</label>
    <select class="log-input" id="review-rating">${[1,2,3,4,5].map(n=>`<option value="${n}" ${n===v.rating?'selected':''}>${n} / 5 stars</option>`).join('')}</select>
    ${field('difficulty','Group difficulty',v.difficulty)}
    ${field('duration','Duration compared with expectations',v.duration)}
    ${field('completion','Group performance',v.completion)}
    ${field('recommendation','Recommendation for next year',v.recommendation)}
    <label class="review-label" for="review-comments">Comments (optional)</label>
    <textarea class="log-input" id="review-comments" maxlength="2000" rows="4" placeholder="What worked? What should change?">${esc(v.comments)}</textarea>
    <div class="log-actions"><button class="btn" id="review-save" type="submit" ${busy?'disabled':''}>${currentReview?'Save changes':'Submit review'}</button></div>
  </form>`;
  const display = currentReview ? `<div class="review-summary">
    <div><strong>Rating:</strong> ${esc(currentReview.rating)} / 5</div>
    ${Object.keys(choices).map(k=>`<div><strong>${esc(({difficulty:'Difficulty',duration:'Duration',completion:'Group performance',recommendation:'Next year'})[k])}:</strong> ${esc(choices[k].find(x=>x[0]===currentReview[k])?.[1] || currentReview[k])}</div>`).join('')}
    ${currentReview.comments?`<p class="prescribed">${esc(currentReview.comments)}</p>`:''}
    <p class="muted">Revision ${esc(currentReview.revision)} · Updated ${esc(stamp(currentReview.updatedAt))}</p>
  </div>` : '<p class="muted">No review has been submitted for this workout yet.</p>';
  return `<div class="eyebrow">Shared programming feedback</div><h1>Workout Reviews</h1>
    ${dateNavigation}<div class="card"><div class="meta">${esc(dateLabel(date))}</div><h2>${esc(focus||'Workout')}</h2>
      <div class="prescribed">${esc(description||'')}</div>
    </div>
    ${!currentUser ? `<div class="card"><h2>Sign in to view reviews</h2><p class="muted">All signed-in CityFit members can read reviews. Only approved reviewers can edit them.</p><button class="btn" id="review-signin">Sign in with Google</button></div>`
      : `<div class="card"><div class="meta">Signed in as ${esc(currentUser.email||'Google user')} · ${esc(role)}</div>
        <h2>Shared review</h2>${display}${form}
        ${readonly?'<p class="muted">Only authorized reviewers can edit shared feedback.</p>':''}
        <div id="review-status" class="log-status" role="status">${esc(state)}</div></div>
        ${adminPanel}<div class="card"><h2>Edit history</h2>${history.length ? history.map(h=>`<div class="log-entry"><strong>Revision ${esc(h.revision)}</strong> · ${esc(stamp(h.editedAt))}
          <div class="meta">Rating ${esc(h.rating)} / 5 · ${esc(choices.recommendation.find(x=>x[0]===h.recommendation)?.[1]||h.recommendation)}</div>
          ${h.comments?`<p>${esc(h.comments)}</p>`:''}</div>`).join('') : '<p class="muted">No history yet.</p>'}</div>`}`;
}
async function refreshAdmins(){if(role!=='admin'||!currentUser)return;try{const result=await getDocs(collection(db,'reviewerPermissions'));admins=result.docs.map(d=>({...d.data(),uid:d.id})).sort((a,b)=>a.email.localeCompare(b.email));}catch(e){adminStatus=error(e);}if(window.cityfitReviewsActive?.())render();}
async function refresh(){
  const context = workout(), ticket=++seq;
  if(!currentUser || !context.date || !context.focus){currentReview=null;history=[];if(window.cityfitReviewsActive?.())render();return;}
  state='Loading review…';if(window.cityfitReviewsActive?.())render();
  try {
    const [r,h] = await Promise.all([
      getDoc(reviewRef(context.date)),
      getDocs(query(collection(db,'reviewHistory'),where('workoutId','==',context.date)))
    ]);
    if(ticket!==seq)return;
    currentReview=r.exists()?r.data():null;
    history=h.docs.map(d=>d.data()).sort((a,b)=>b.revision-a.revision);
    state='';
  }catch(e){if(ticket===seq){currentReview=null;history=[];state=error(e);}}
  if(window.cityfitReviewsActive?.())render();
}
function render(){
  if(!window.cityfitReviewsActive?.())return;
  const context=workout();
  if(!context.focus){root().innerHTML='<div class="card"><h2>No scheduled workout</h2><p>Choose a programmed date from Today or Calendar to view its review.</p></div>';return;}
  root().innerHTML=reviewMarkup();
  const datePicker=document.querySelector('#review-date-picker');
  if(datePicker)datePicker.onchange=()=>window.cityfitReviewSelectDate?.(datePicker.value);
  const dates=window.cityfitReviewDates?.()||[],position=dates.indexOf(context.date);
  const prev=document.querySelector('#review-prev'),next=document.querySelector('#review-next');
  if(prev)prev.onclick=()=>window.cityfitReviewSelectDate?.(dates[position-1]);
  if(next)next.onclick=()=>window.cityfitReviewSelectDate?.(dates[position+1]);
  const signin=document.querySelector('#review-signin');
  if(signin)signin.onclick=async()=>{try{await setPersistence(auth,browserLocalPersistence);await signInWithPopup(auth,new GoogleAuthProvider());}catch(e){setStatus(error(e));}};
  const adminForm=document.querySelector('#review-admin-form');
  if(adminForm)adminForm.onsubmit=async e=>{e.preventDefault();const uid=document.querySelector('#review-role-uid').value.trim();const email=document.querySelector('#review-role-email').value.trim();const newRole=document.querySelector('#review-role-choice').value;try{if(!/^[A-Za-z0-9]{15,128}$/.test(uid))throw new Error('Enter a valid Firebase Authentication UID.');await setDoc(doc(db,'reviewerPermissions',uid),{email,role:newRole});adminStatus='Access updated.';await refreshAdmins();}catch(err){adminStatus=error(err);render();}};
  document.querySelectorAll('[data-revoke]').forEach(b=>b.onclick=async()=>{const uid=b.dataset.revoke;if(uid===currentUser?.uid)return;if(!confirm('Remove reviewer access for this account?'))return;try{await deleteDoc(doc(db,'reviewerPermissions',uid));adminStatus='Access revoked.';await refreshAdmins();}catch(err){adminStatus=error(err);render();}});
  const form=document.querySelector('#review-form');
  if(form)form.onsubmit=async e=>{
    e.preventDefault();if(!currentUser||!isReviewer()||busy)return;
    const data={rating:Number(document.querySelector('#review-rating').value),
      difficulty:document.querySelector('#review-difficulty').value,
      duration:document.querySelector('#review-duration').value,
      completion:document.querySelector('#review-completion').value,
      recommendation:document.querySelector('#review-recommendation').value,
      comments:document.querySelector('#review-comments').value.trim()};
    const expected=currentReview?.revision||0;
    const date=context.date, uid=currentUser.uid;
    busy=true;setStatus('Saving…');render();
    try {
      await runTransaction(db,async tx=>{
        const ref=reviewRef(date), snap=await tx.get(ref);
        const actual=snap.exists()?snap.data().revision:0;
        if(actual!==expected)throw new Error('Another reviewer updated this workout. Reload the review before editing.');
        const revision=actual+1;
        const update={...data,updatedBy:uid,updatedAt:serverTimestamp(),revision};
        if(!snap.exists())Object.assign(update,{date,workoutTitle:context.focus,workoutDescription:context.description||'',createdBy:uid,createdAt:serverTimestamp()});
        tx.set(ref,update,{merge:!!snap.exists()});
        tx.set(doc(db,'reviewHistory',date+'_'+revision),{workoutId:date,revision,editorUid:uid,editedAt:serverTimestamp(),...data});
      });
      state='Review saved.';await refresh();
    }catch(e){state=error(e);}
    finally{busy=false;render();}
  };
}
onAuthStateChanged(auth,async u=>{
  currentUser=u;role='member';currentReview=null;history=[];seq++;
  if(u){try{const r=await getDoc(doc(db,'reviewerPermissions',u.uid));if(r.exists()&&['reviewer','admin'].includes(r.data().role))role=r.data().role;}catch(e){state=error(e);}}
  if(window.cityfitReviewsActive?.()){render();await refresh();if(role==='admin')await refreshAdmins();}
});
window.cityfitRenderReviews=render;
window.cityfitLoadReviews=async()=>{await refresh();if(role==='admin')await refreshAdmins();};
