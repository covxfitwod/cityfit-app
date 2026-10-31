import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, setPersistence, browserLocalPersistence } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { getFirestore, doc, getDoc, getDocs, collection, runTransaction, serverTimestamp, query, where, orderBy } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const config = {
  apiKey: "AIzaSyBJ0b_22RLs1qwkxj8n9A9_EM0ZT3guytE",
  authDomain: "cityfit-workout-app.firebaseapp.com",
  projectId: "cityfit-workout-app",
  storageBucket: "cityfit-workout-app.firebasestorage.app",
  messagingSenderId: "307788439314",
  appId: "1:307788439314:web:8b77fb855b8d7986e19dcb"
};
const app = getApps()[0] || initializeApp(config);
const auth = getAuth(app), db = getFirestore(app);
const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const choices = {
  difficulty: [['too_easy','Too easy'],['about_right','About right'],['too_difficult','Too difficult']],
  duration: [['quicker','Way quicker'],['as_expected','As expected'],['longer','Way longer']],
  completion: [['nearly_all','Nearly everyone completed'],['most_scaled','Most completed with scaling'],['many_scaled','Many needed significant scaling']],
  recommendation: [['keep','Keep'],['progress','Progress'],['modify','Modify'],['replace','Replace']]
};
let currentUser = null, role = 'member', currentReview = null, history = [], state = '', busy = false, seq = 0;
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
  const v = currentReview || defaultData;
  const canEdit = isReviewer();
  const readonly = currentReview && !canEdit;
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
    <div class="card"><div class="meta">${esc(dateLabel(date))}</div><h2>${esc(focus||'Workout')}</h2>
      <div class="prescribed">${esc(description||'')}</div>
    </div>
    ${!currentUser ? `<div class="card"><h2>Sign in to view reviews</h2><p class="muted">All signed-in CityFit members can read reviews. Only approved reviewers can edit them.</p><button class="btn" id="review-signin">Sign in with Google</button></div>`
      : `<div class="card"><div class="meta">Signed in as ${esc(currentUser.email||'Google user')} · ${esc(role)}</div>
        <h2>Shared review</h2>${display}${form}
        ${readonly?'<p class="muted">Only authorized reviewers can edit shared feedback.</p>':''}
        <div id="review-status" class="log-status" role="status">${esc(state)}</div></div>
        <div class="card"><h2>Edit history</h2>${history.length ? history.map(h=>`<div class="log-entry"><strong>Revision ${esc(h.revision)}</strong> · ${esc(stamp(h.editedAt))}
          <div class="meta">Rating ${esc(h.rating)} / 5 · ${esc(choices.recommendation.find(x=>x[0]===h.recommendation)?.[1]||h.recommendation)}</div>
          ${h.comments?`<p>${esc(h.comments)}</p>`:''}</div>`).join('') : '<p class="muted">No history yet.</p>'}</div>`}`;
}
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
  const signin=document.querySelector('#review-signin');
  if(signin)signin.onclick=async()=>{try{await setPersistence(auth,browserLocalPersistence);await signInWithPopup(auth,new GoogleAuthProvider());}catch(e){setStatus(error(e));}};
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
  if(window.cityfitReviewsActive?.()){render();await refresh();}
});
window.cityfitRenderReviews=render;
window.cityfitLoadReviews=refresh;
