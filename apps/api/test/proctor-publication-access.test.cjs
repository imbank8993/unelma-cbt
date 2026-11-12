const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
require('ts-node').register({project:path.resolve(__dirname,'../tsconfig.json'),transpileOnly:true});
const {fixtureDb}=require('./fixture-db.cjs');
const {AuthorizationService}=require('../src/auth/authorization.service.ts');
const {QuestionBanksService}=require('../src/questions/question-banks.service.ts');
const {QuestionsService}=require('../src/questions/questions.service.ts');
const {BankContentService}=require('../src/questions/bank-content.service.ts');
const {ExamAdminService}=require('../src/proctor/exam-admin.service.ts');
const {ExamKeyCorrectionService}=require('../src/grading/exam-key-correction.service.ts');
const {ProctoringService}=require('../src/proctoring/proctoring.service.ts');
const user=id=>({id,organizationId:'school',roles:id==='proctor'?['PROKTOR']:id==='admin'?['ADMIN']:['PROKTOR']});
const denied=e=>e.getStatus?.()===403;
function fixture(){
 const db=fixtureDb({cbt_question_banks:[
  {id:'own',organization_id:'school',created_by:'proctor',is_published:false},
  {id:'draft',organization_id:'school',created_by:'teacher',is_published:false},
  {id:'public',organization_id:'school',created_by:'teacher',is_published:true},
  {id:'foreign',organization_id:'other',created_by:'teacher',is_published:true}],
  cbt_exams:[{id:'own-exam',created_by:'proctor',is_published:false,organization_id:'school',exam_type:'daily',question_bank_id:'own'},
   {id:'draft-exam',created_by:'teacher',is_published:false,organization_id:'school',exam_type:'daily',question_bank_id:'draft'},
   {id:'public-exam',created_by:'teacher',is_published:true,organization_id:'school',exam_type:'daily',question_bank_id:'public'}],
  cbt_bank_questions:[{id:'q',bank_id:'public',type:'mcq'}],
  cbt_exam_question_snapshots:[{exam_id:'public-exam',question_snapshot:{id:'q',bank_id:'public',type:'mcq'}}]});
 const roles={hasOrgRole:async(id,school,allowed)=>school==='school'&&allowed.some(role=>
  ({proctor:['Proktor'],teacher:['Proktor'],otherTeacher:['Proktor'],admin:['Admin','Proktor']}[id]||[]).includes(role))};
 const auth=new AuthorizationService(db,roles,{assertSchoolId:async id=>{if(id!=='school')throw Object.assign(Error('School denied'),{getStatus:()=>403});return id}});
 const users={emailMap:async()=>new Map()};
 return {db,auth,roles,banks:new QuestionBanksService(db,auth,roles,users),exams:new ExamAdminService(db,auth,roles)};
}
// Proktor adalah pembuat konten mandiri: bank dan ujian milik pembuat lain —
// termasuk yang sudah dipublikasikan — tidak terbaca kecuali dibagikan lewat
// kolaborasi. Hanya Admin yang melihat seluruh konten sekolah.
test('proctors read and edit only their own banks; publication grants nothing; admins retain all access',async()=>{
 const f=fixture();
 for(const bank of ['draft','public'])for(const access of ['read','write'])await assert.rejects(f.auth.assertBankAccess(user('proctor'),bank,access),denied);
 await f.auth.assertBankAccess(user('proctor'),'own');await f.auth.assertBankAccess(user('proctor'),'own','read');
 for(const bank of ['draft','public'])for(const access of ['read','write'])await f.auth.assertBankAccess(user('admin'),bank,access);
 await assert.rejects(f.auth.assertBankAccess(user('admin'),'foreign','read'),denied);
 await f.auth.assertBankAccess(user('teacher'),'draft');
 await assert.rejects(f.auth.assertBankAccess(user('otherTeacher'),'public','read'),denied);
});
test('foreign published bank questions and content stay closed to proctors, without writes',async()=>{
 const f=fixture(),q=new QuestionsService(f.db,f.auth,{}),content=new BankContentService(f.db,f.auth);
 await assert.rejects(q.listByBank(user('proctor'),'public'),denied);
 await assert.rejects(content.listStimuli(user('proctor'),'public'),denied);
 await assert.rejects(f.banks.get(user('proctor'),'public'),denied);
 for(const action of [()=>q.save(user('proctor'),{bankId:'public'}),()=>q.updateMetadata(user('proctor'),'q',{}),
  ()=>q.remove(user('proctor'),'q','public'),()=>q.reorder(user('proctor'),'public',['q']),
  ()=>f.banks.setPublished(user('proctor'),'public',false),()=>f.banks.remove(user('proctor'),'public'),
  ()=>content.createStimulus(user('proctor'),'public','title','text','request')])await assert.rejects(action,denied);
 assert.equal(f.db.writes.length,0);
 assert.equal((await f.banks.get(user('admin'),'public')).canManage,true);
});
test('bank and exam listings show proctors only their own content and preserve administrator access',async()=>{
 const f=fixture();
 assert.deepEqual((await f.banks.list(user('proctor'),'school')).map(b=>b.id),['own']);
 await f.exams.list(user('proctor'),'school');
 const query=f.db.queries.filter(query=>query.table==='cbt_exams').find(query=>query.calls.some(call=>call[0]==='or'));
 assert.deepEqual(query.calls.find(call=>call[0]==='or'),['or','created_by.eq.proctor,question_bank_id.in.(own)']);
 assert.equal((await f.banks.list(user('admin'),'school')).length,3);
 assert.equal((await f.exams.list(user('admin'),'school')).length,3);
});
test('direct monitoring and management of foreign exams are denied for proctors, published or not',async()=>{
 const f=fixture();
 for(const id of ['draft-exam','public-exam']){
  await assert.rejects(f.auth.assertExamMonitoring(user('proctor'),id),denied);
  await assert.rejects(f.auth.assertExamStaff(user('proctor'),id),denied);
 }
 await f.auth.assertExamMonitoring(user('proctor'),'own-exam');
 await f.auth.assertExamStaff(user('proctor'),'own-exam');
 await f.auth.assertExamMonitoring(user('admin'),'draft-exam');await f.auth.assertExamStaff(user('admin'),'draft-exam');
 await f.auth.assertExamStaff(user('teacher'),'draft-exam');
});
test('exam-key correction still requires ownership',async()=>{
 const f=fixture();
 await assert.rejects(f.auth.assertBankAccess(user('proctor'),'draft','write'),denied);
 const correction=new ExamKeyCorrectionService(f.db,f.auth,{});
 await assert.rejects(correction.get(user('proctor'),'public-exam'),denied);
 assert.equal(f.db.writes.length,0);
});
test('reset requires proctor authorship even for published exams; administrators and author teachers keep access',async()=>{
 const f=fixture();
 await f.auth.assertExamStaff(user('proctor'),'own-exam','reset');
 for(const exam of ['draft-exam','public-exam'])await assert.rejects(f.auth.assertExamStaff(user('proctor'),exam,'reset'),denied);
 for(const exam of ['own-exam','draft-exam','public-exam'])await f.auth.assertExamStaff(user('admin'),exam,'reset');
 for(const exam of ['draft-exam','public-exam'])await f.auth.assertExamStaff(user('teacher'),exam,'reset');
 const exams=await f.exams.list(user('proctor'),'school');
 assert.equal(exams.find(e=>e.id==='own-exam').canResetParticipants,true);
 assert.equal(exams.find(e=>e.id==='public-exam').canResetParticipants,false);
 assert.ok((await f.exams.list(user('admin'),'school')).every(e=>e.canResetParticipants===true));
});
test('direct recovery and makeup endpoints deny foreign exam resets without touching attempts or answers',async()=>{
 const f=fixture();
 f.db.tables.cbt_exam_attempts=[{id:'attempt',exam_id:'public-exam',status:'submitted'}];
 const service=new ProctoringService(f.db,f.auth,{});
 await assert.rejects(service.resetAttempt(user('proctor'),'attempt','Pemulihan peserta',30),denied);
 await assert.rejects(service.startMakeupAttempt(user('proctor'),'attempt','Ujian susulan',30),denied);
 assert.equal(f.db.writes.length,0);
 assert.equal(f.db.tables.cbt_exam_attempts[0].status,'submitted');
});


for (const permission of ['viewer', 'editor', 'manager']) test(`a bank ${permission} grant gives a proctor exactly that access`, async () => {
 const f=fixture();
 f.db.tables.cbt_bank_collaborators=[{bank_id:'draft',user_id:'proctor',permission}];
 const canEdit=permission!=='viewer';
 await f.auth.assertBankAccess(user('proctor'),'draft','read');
 if(canEdit)await f.auth.assertBankAccess(user('proctor'),'draft','write');
 else await assert.rejects(f.auth.assertBankAccess(user('proctor'),'draft','write'),denied);
 await assert.rejects(f.auth.assertBankAccess(user('proctor'),'draft','delete'),denied);
 const bank=await f.banks.get(user('proctor'),'draft');
 assert.deepEqual([bank.canManage,bank.canShare,bank.canDelete],[canEdit,permission==='manager',false]);
 // Bank lain yang tidak dibagikan tetap tertutup.
 await assert.rejects(f.auth.assertBankAccess(user('proctor'),'public','read'),denied);
 f.db.tables.cbt_bank_collaborators[0].revoked_at='2026-01-01T00:00:00Z';
 await assert.rejects(f.auth.assertBankAccess(user('proctor'),'draft','read'),denied);
});

test('proctors keep their own draft banks and administrators retain full school access',async()=>{
 const f=fixture();
 for(const id of ['proctor','admin']){
  const own=await f.banks.get(user(id),'own');assert.equal(own.canManage,true);assert.equal(own.canShare,true);
 }
 assert.deepEqual((await f.banks.list(user('proctor'),'school',true)).map(bank=>bank.id),[]);
 const own=await f.banks.get(user('proctor'),'own');assert.equal(own.is_published,false);
 const original=f.roles.hasOrgRole;
 f.roles.hasOrgRole=async(id,school,allowed)=>id==='proctor'&&school==='school'&&allowed.includes('Proktor')||await original(id,school,allowed);
 await assert.rejects(f.auth.assertBankAccess(user('proctor'),'public','write'),denied);
});

test('proctors cannot delete even their own banks; all permission responses agree',async()=>{
 const f=fixture();
 // Use an unlinked bank so the role rule is the only deletion barrier.
 f.db.tables.cbt_exams=[];
 for(const id of ['own','draft','public']) {
  await assert.rejects(f.auth.assertBankAccess(user('proctor'),id,'delete'),denied);
  await assert.rejects(f.banks.remove(user('proctor'),id),denied);
 }
 await assert.rejects(f.auth.assertResourceOwner(user('proctor'),'bank','own'),denied);
 assert.equal((await f.banks.get(user('proctor'),'own')).canDelete,false);
 assert.ok((await f.banks.list(user('proctor'),'school')).every(bank=>bank.canDelete===false));
 assert.equal(f.db.writes.length,0);
 assert.equal(f.db.tables.cbt_question_banks.length,4);
 // A simultaneous Guru role must not bypass a Proktor restriction.
 const original=f.roles.hasOrgRole;
 f.roles.hasOrgRole=async(id,school,allowed)=>id==='proctor'&&school==='school'&&allowed.includes('Proktor')||await original(id,school,allowed);
 await assert.rejects(f.banks.remove(user('proctor'),'own'),denied);
 // Admin + Proktor retains the administrator's deletion permission.
 assert.equal((await f.banks.get(user('admin'),'own')).canDelete,true);
 assert.equal((await f.banks.list(user('admin'),'school')).find(bank=>bank.id==='own').canDelete,true);
 await f.banks.remove(user('admin'),'own');
 // Pembuat lain (kini juga Proktor) pun tidak dapat menghapus banknya; hanya Admin.
 await assert.rejects(f.banks.remove(user('teacher'),'draft'),denied);
 await f.banks.remove(user('admin'),'draft');
 assert.deepEqual(f.db.tables.cbt_question_banks.map(bank=>bank.id),['public','foreign']);
});
