import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment, assertSucceeds, assertFails} from '@firebase/rules-unit-testing';
import {doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, getDocs, collection, runTransaction} from 'firebase/firestore';

let env;
const projectId='demo-cityfit-security';
const uid={admin:'testAdmin',reviewer:'testReviewer',member:'testMember',other:'testOther'};
const reviewId='2026-11-02';
const values={rating:4,difficulty:'about_right',duration:'as_expected',completion:'most_scaled',recommendation:'keep',comments:'Good workout'};
const reviewDoc=(owner=uid.reviewer)=>({
  date:reviewId,workoutTitle:'Pull/Push',workoutDescription:'Example',
  ...values,createdBy:owner,updatedBy:owner,
  createdAt:serverTimestamp(),updatedAt:serverTimestamp(),revision:1
});
const historyDoc=(owner=uid.reviewer,revision=1,overrides={})=>({
  workoutId:reviewId,revision,editorUid:owner,editedAt:serverTimestamp(),...values,...overrides
});
const as=(user)=>env.authenticatedContext(user).firestore();
const ref=(db,path)=>doc(db,path);
async function seed(){
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore();
    await setDoc(ref(db,'reviewerPermissions/'+uid.admin),{role:'admin',email:'admin@example.com'});
    await setDoc(ref(db,'reviewerPermissions/'+uid.reviewer),{role:'reviewer',email:'reviewer@example.com'});
    await setDoc(ref(db,'users/'+uid.member+'/workouts/2026-11-02'),{notes:'Private workout'});
  });
}
before(async()=>{
  env=await initializeTestEnvironment({projectId,firestore:{rules:readFileSync('firestore.rules','utf8'),host:'127.0.0.1',port:8080}});
});
after(async()=>{if(env)await env.cleanup()});
test('private logs: only owner can read and write',async()=>{
  await env.clearFirestore();await seed();
  await assertSucceeds(getDoc(ref(as(uid.member),'users/'+uid.member+'/workouts/2026-11-02')));
  await assertFails(getDoc(ref(as(uid.admin),'users/'+uid.member+'/workouts/2026-11-02')));
  await assertFails(getDoc(ref(as(uid.other),'users/'+uid.member+'/workouts/2026-11-02')));
  await assertFails(getDoc(ref(env.unauthenticatedContext().firestore(),'users/'+uid.member+'/workouts/2026-11-02')));
  await assertSucceeds(setDoc(ref(as(uid.member),'users/'+uid.member+'/workouts/new'),{notes:'Mine'}));
  await assertFails(setDoc(ref(as(uid.reviewer),'users/'+uid.member+'/workouts/new'),{notes:'Intrusion'}));
});
test('role assignment: member cannot self-promote; admin can grant and revoke',async()=>{
  await env.clearFirestore();await seed();
  await assertFails(setDoc(ref(as(uid.member),'reviewerPermissions/'+uid.member),{role:'admin',email:'member@example.com'}));
  await assertFails(getDoc(ref(as(uid.member),'reviewerPermissions/'+uid.admin)));
  await assertSucceeds(getDoc(ref(as(uid.member),'reviewerPermissions/'+uid.member)));
  await assertSucceeds(setDoc(ref(as(uid.admin),'reviewerPermissions/'+uid.other),{role:'reviewer',email:'other@example.com'}));
  await assertSucceeds(deleteDoc(ref(as(uid.admin),'reviewerPermissions/'+uid.other)));
});
test('shared review: authenticated read, reviewer atomic create, member cannot create',async()=>{
  await env.clearFirestore();await seed();
  await assertFails(getDoc(ref(env.unauthenticatedContext().firestore(),'workoutReviews/'+reviewId)));
  await assertSucceeds(getDoc(ref(as(uid.member),'workoutReviews/'+reviewId)));
  await assertFails(setDoc(ref(as(uid.member),'workoutReviews/'+reviewId),reviewDoc(uid.member)));
  await assertFails(setDoc(ref(as(uid.reviewer),'workoutReviews/'+reviewId),reviewDoc()));
  const db=as(uid.reviewer),batch=writeBatch(db);
  batch.set(ref(db,'workoutReviews/'+reviewId),reviewDoc());
  batch.set(ref(db,'reviewHistory/'+reviewId+'_1'),historyDoc());
  await assertSucceeds(batch.commit());
  await assertSucceeds(getDoc(ref(as(uid.member),'workoutReviews/'+reviewId)));
  await assertFails(updateDoc(ref(as(uid.member),'workoutReviews/'+reviewId),{comments:'Unauthorized'}));
});
test('audit: rejects mismatched history and permits matching revision 2',async()=>{
  await env.clearFirestore();await seed();
  const db=as(uid.reviewer);
  const first=writeBatch(db);
  first.set(ref(db,'workoutReviews/'+reviewId),reviewDoc());
  first.set(ref(db,'reviewHistory/'+reviewId+'_1'),historyDoc());
  await assertSucceeds(first.commit());
  const bad=writeBatch(db);
  bad.update(ref(db,'workoutReviews/'+reviewId),{comments:'Changed',revision:2,updatedBy:uid.reviewer,updatedAt:serverTimestamp()});
  bad.set(ref(db,'reviewHistory/'+reviewId+'_2'),historyDoc(uid.reviewer,2,{comments:'Forged'}));
  await assertFails(bad.commit());
  const good=writeBatch(db);
  good.update(ref(db,'workoutReviews/'+reviewId),{comments:'Changed',revision:2,updatedBy:uid.reviewer,updatedAt:serverTimestamp()});
  good.set(ref(db,'reviewHistory/'+reviewId+'_2'),historyDoc(uid.reviewer,2,{comments:'Changed'}));
  await assertSucceeds(good.commit());
  await assertFails(deleteDoc(ref(as(uid.reviewer),'reviewHistory/'+reviewId+'_1')));
});

test('authenticated member can read review history, but cannot write or list roles',async()=>{
  await env.clearFirestore();await seed();
  const db=as(uid.reviewer),batch=writeBatch(db);
  batch.set(ref(db,'workoutReviews/'+reviewId),reviewDoc());
  batch.set(ref(db,'reviewHistory/'+reviewId+'_1'),historyDoc());
  await assertSucceeds(batch.commit());
  await assertSucceeds(getDocs(collection(as(uid.member),'reviewHistory')));
  await assertFails(getDocs(collection(env.unauthenticatedContext().firestore(),'reviewHistory')));
  await assertFails(getDocs(collection(as(uid.member),'reviewerPermissions')));
  await assertFails(setDoc(ref(as(uid.member),'reviewHistory/'+reviewId+'_2'),historyDoc(uid.member,2)));
  await assertFails(deleteDoc(ref(as(uid.member),'workoutReviews/'+reviewId)));
});
test('admin and reviewer editing permissions, immutable audit, and role revocation',async()=>{
  await env.clearFirestore();await seed();
  const db=as(uid.reviewer),first=writeBatch(db);
  first.set(ref(db,'workoutReviews/'+reviewId),reviewDoc());
  first.set(ref(db,'reviewHistory/'+reviewId+'_1'),historyDoc());
  await assertSucceeds(first.commit());
  const adminDb=as(uid.admin),edit=writeBatch(adminDb);
  edit.update(ref(adminDb,'workoutReviews/'+reviewId),{comments:'Admin edit',revision:2,updatedBy:uid.admin,updatedAt:serverTimestamp()});
  edit.set(ref(adminDb,'reviewHistory/'+reviewId+'_2'),historyDoc(uid.admin,2,{comments:'Admin edit'}));
  await assertSucceeds(edit.commit());
  await assertFails(updateDoc(ref(adminDb,'reviewHistory/'+reviewId+'_1'),{comments:'Tampered'}));
  await assertSucceeds(deleteDoc(ref(adminDb,'reviewerPermissions/'+uid.reviewer)));
  const revoked=as(uid.reviewer),attempt=writeBatch(revoked);
  attempt.update(ref(revoked,'workoutReviews/'+reviewId),{comments:'After revoke',revision:3,updatedBy:uid.reviewer,updatedAt:serverTimestamp()});
  attempt.set(ref(revoked,'reviewHistory/'+reviewId+'_3'),historyDoc(uid.reviewer,3,{comments:'After revoke'}));
  await assertFails(attempt.commit());
  await assertSucceeds(getDoc(ref(revoked,'workoutReviews/'+reviewId)));
});

test('real review UI transaction: create and edit with matching audit history',async()=>{
  await env.clearFirestore();await seed();
  const db=as(uid.reviewer);
  async function save(data,expected){
    return runTransaction(db,async tx=>{
      const review=ref(db,'workoutReviews/'+reviewId);
      const snap=await tx.get(review);
      const actual=snap.exists()?snap.data().revision:0;
      if(actual!==expected)throw new Error('Another reviewer updated this workout.');
      const revision=actual+1;
      const update={...data,updatedBy:uid.reviewer,updatedAt:serverTimestamp(),revision};
      if(!snap.exists())Object.assign(update,{date:reviewId,workoutTitle:'Pull/Push',workoutDescription:'Example',createdBy:uid.reviewer,createdAt:serverTimestamp()});
      tx.set(review,update,{merge:!!snap.exists()});
      tx.set(ref(db,'reviewHistory/'+reviewId+'_'+revision),{workoutId:reviewId,revision,editorUid:uid.reviewer,editedAt:serverTimestamp(),...data});
    });
  }
  await assertSucceeds(save(values,0));
  assert.equal((await getDoc(ref(db,'workoutReviews/'+reviewId))).data().revision,1);
  await assertSucceeds(save({...values,comments:'Revised after workout'},1));
  assert.equal((await getDoc(ref(db,'workoutReviews/'+reviewId))).data().revision,2);
  assert.equal((await getDoc(ref(db,'reviewHistory/'+reviewId+'_2'))).data().comments,'Revised after workout');
  await assert.rejects(save(values,1),/Another reviewer updated/);
});
