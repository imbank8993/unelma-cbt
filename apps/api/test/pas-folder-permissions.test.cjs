const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
require('ts-node').register({project:path.resolve(__dirname,'../tsconfig.json'),transpileOnly:true});
const {fixtureDb}=require('./fixture-db.cjs');
const {createFixtures,signingInput}=require('./pas-administration-fixtures.cjs');
const {AuthorizationService}=require('../src/auth/authorization.service.ts');
const {CollaborationService}=require('../src/auth/collaboration.service.ts');
const {PasService}=require('../src/pas/pas.service.ts');
const {PasRoomsService}=require('../src/pas/pas-rooms.service.ts');
const {PasSchedulesService}=require('../src/pas/pas-schedules.service.ts');
const {PasAdministrationService}=require('../src/pas/pas-administration.service.ts');
const owner={id:'proctor-creator-1',organizationId:'org-1'},other={id:'other-proctor',organizationId:'org-1'},admin={id:'admin',organizationId:'org-1'};
const forbidden=e=>e.getStatus?.()===403;
function fixture(permission,fail=[]){
 const data=createFixtures();
 data.cbt_pas_period_collaborators=permission?[{period_id:'period-1',user_id:other.id,permission,granted_by:owner.id}]:[];
 data.cbt_profiles.push({id:other.id,full_name:'Proktor lain'});
 data.cbt_organization_members=[owner,other,admin].map(u=>({user_id:u.id,organization_id:'org-1',is_active:true,profiles:{full_name:u.id},member_roles:[{roles:{name:u.id==='admin'?'Admin':'Proktor'}}]}));
 const db=fixtureDb(data,fail,{now:'2026-10-17T01:00:00Z'});
 const roles={hasOrgRole:async(id,org,allowed)=>org==='org-1'&&[owner.id,other.id,'admin'].includes(id)&&allowed.includes(id==='admin'?'Admin':'Proktor')};
 const scope={assertSchoolId:async id=>{if(id!=='org-1')throw Object.assign(Error('school denied'),{getStatus:()=>403});return id;}};
 const auth=new AuthorizationService(db,roles,scope);
 return {db,auth,periods:new PasService(db,auth),rooms:new PasRoomsService(db,auth),schedules:new PasSchedulesService(db,auth,{getSchoolTimeZone:async()=> 'Asia/Makassar'}),administration:new PasAdministrationService(db,auth),collaboration:new CollaborationService(db,auth)};
}

// ASAS/ASAT/AM adalah urusan sekolah: hanya Admin. Proktor (pembuat konten)
// tidak dapat membaca maupun mengubah folder ujian, termasuk folder yang dulu
// ia buat dan folder yang dibagikan kepadanya.
test('proctors can neither view nor mutate a PAS folder, even one they created',async()=>{
 const f=fixture();
 for(const user of [other,owner]){
  await assert.rejects(f.periods.listPeriods(user,'org-1'),forbidden);
  await assert.rejects(f.periods.getPeriod(user,'period-1'),forbidden);
  await assert.rejects(f.rooms.listRooms(user,'period-1'),forbidden);
  await assert.rejects(f.rooms.listRoomParticipants(user,'period-1'),forbidden);
  await assert.rejects(f.schedules.listSessions(user,'period-1'),forbidden);
  const calls=[()=>f.periods.updatePeriod(user,'period-1',{name:'Hacked'}),()=>f.periods.updateCommitteeChair(user,'period-1',{committee_chair_name:'Hacked'}),
  ()=>f.periods.updateExamSettings(user,'period-1',{}),()=>f.periods.setPeriodLock(user,'period-1',true),()=>f.periods.removePeriod(user,'period-1'),
  ()=>f.periods.createPeriod(user,'org-1',{name:'Baru',type:'pas'}),
  ()=>f.schedules.createSession(user,'period-1',{}),()=>f.schedules.removeSession(user,'session-1'),()=>f.schedules.addSchedule(user,{pas_period_id:'period-1'}),
  ()=>f.schedules.removeSchedule(user,'sched-1'),()=>f.schedules.setActivation(user,'sched-1',true),()=>f.schedules.mergeExams(user,'period-1'),
  ()=>f.rooms.createRoom(user,'period-1',{}),()=>f.rooms.removeRoom(user,'room-1'),()=>f.rooms.assignInvigilators(user,'room-1',[],'session-1','2026-10-17'),
  ()=>f.rooms.copyInvigilators(user,'period-1','2026-10-17','2026-10-18'),()=>f.rooms.assignStudents(user,'period-1','room-1',[]),()=>f.rooms.removeStudent(user,'period-1','student-1')];
  for(const call of calls)await assert.rejects(call,forbidden);
  const generation=await f.schedules.generate(user,['sched-1']);assert.equal(generation.created,0);
  await assert.rejects(f.administration.approveAdministrationSlot(user,signingInput()),forbidden);
 }
 assert.equal(f.db.writes.length,0);
});

for(const permission of ['viewer','editor','manager'])test(`a ${permission} period grant gives a proctor no PAS rights`,async()=>{
 const f=fixture(permission);
 await assert.rejects(f.periods.getPeriod(other,'period-1'),forbidden);
 await assert.rejects(f.periods.listPeriods(other,'org-1'),forbidden);
 await assert.rejects(f.periods.updateCommitteeChair(other,'period-1',{committee_chair_name:'Hacked'}),forbidden);
 await assert.rejects(f.periods.removePeriod(other,'period-1'),forbidden);
 await assert.rejects(f.auth.assertProktorByRecord(other,'cbt_pas_periods','period-1'),forbidden);
 assert.equal(f.db.writes.length,0);
});

test('only administrators manage PAS folders; bank/exam grants never reach them',async()=>{
 const f=fixture();
 await f.auth.assertPasPeriodManage(admin,'period-1');await f.auth.assertPasPeriodManage(admin,'period-1','delete');
 const detail=await f.periods.getPeriod(admin,'period-1');assert.equal(detail.canManage,true);assert.equal(detail.canDelete,true);
 assert.equal((await f.periods.listPeriods(admin,'org-1'))[0].canManage,true);
 await assert.rejects(f.auth.assertPasPeriodManage(owner,'period-1'),forbidden);
 f.db.tables.cbt_exam_collaborators=[{exam_id:'exam-1',user_id:other.id,permission:'manager'}];
 f.db.tables.cbt_bank_collaborators=[{bank_id:'bank-1',user_id:other.id,permission:'manager'}];
 await assert.rejects(f.auth.assertPasPeriodManage(other,'period-1'),forbidden);
 f.db.tables.cbt_pas_periods[0].organization_id='other-school';await assert.rejects(f.auth.assertPasPeriodManage(admin,'period-1'),forbidden);
});

test('PAS folders cannot be shared with proctors',async()=>{
 const f=fixture();
 await assert.rejects(f.collaboration.save(owner,'period','period-1',other.id,{permission:'editor'}),forbidden);
 const candidates=await f.collaboration.candidates(admin,'period','period-1');
 assert.equal(candidates.some(c=>c.id===other.id||c.id===owner.id),false);
 await assert.rejects(f.collaboration.save(admin,'period','period-1',other.id,{permission:'editor'}),/Kolaborator/);
 await assert.rejects(f.auth.assertPasPeriodManage(other,'period-1'),forbidden);
});

test('folder permission lookup failure denies writes',async()=>{
 const f=fixture(undefined,['cbt_pas_period_collaborators']);await assert.rejects(f.auth.assertPasPeriodManage(other,'period-1'));assert.equal(f.db.writes.length,0);
});
