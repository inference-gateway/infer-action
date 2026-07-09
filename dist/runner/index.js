#!/usr/bin/env bun
// @bun
import{spawn as Hh,spawnSync as $h}from"child_process";import{createWriteStream as Dh,writeFileSync as Pn}from"fs";import{PassThrough as Oh}from"stream";var Bn=["git add( .*)?","git commit( .*)?","git push( .*)?","git checkout( .*)?","git switch( .*)?","git fetch( .*)?","git restore( .*)?","git reset( .*)?","git stash( .*)?","gh pr create( .*)?","gh pr ready( .*)?","gh pr edit( [0-9]+)? --(title|body|body-file)( .*)?"];function c(n,h){return[...n?Bn:[],h.trim()].filter(Boolean).join(",")}class z{token;baseUrl;fetchImpl;constructor(n){this.token=n.token,this.baseUrl=(n.baseUrl||process.env.GITHUB_API_URL||"https://api.github.com").replace(/\/+$/,""),this.fetchImpl=n.fetchImpl??fetch}issues={getComment:(n)=>this.request("GET",`/repos/${n.owner}/${n.repo}/issues/comments/${n.comment_id}`),updateComment:(n)=>this.request("PATCH",`/repos/${n.owner}/${n.repo}/issues/comments/${n.comment_id}`,void 0,{body:n.body}),createComment:(n)=>this.request("POST",`/repos/${n.owner}/${n.repo}/issues/${n.issue_number}/comments`,void 0,{body:n.body}),listComments:(n)=>this.request("GET",`/repos/${n.owner}/${n.repo}/issues/${n.issue_number}/comments`,{per_page:n.per_page,page:n.page}),listEventsForTimeline:(n)=>this.request("GET",`/repos/${n.owner}/${n.repo}/issues/${n.issue_number}/timeline`,{per_page:n.per_page})};pulls={list:(n)=>this.request("GET",`/repos/${n.owner}/${n.repo}/pulls`,{head:n.head,state:n.state,per_page:n.per_page}),get:(n)=>this.request("GET",`/repos/${n.owner}/${n.repo}/pulls/${n.pull_number}`),create:(n)=>this.request("POST",`/repos/${n.owner}/${n.repo}/pulls`,void 0,{head:n.head,base:n.base,title:n.title,body:n.body,draft:n.draft}),listComments:(n)=>this.request("GET",`/repos/${n.owner}/${n.repo}/pulls/${n.pull_number}/comments`,{per_page:n.per_page,page:n.page}),update:(n)=>this.request("PATCH",`/repos/${n.owner}/${n.repo}/pulls/${n.pull_number}`,void 0,{body:n.body}),createReviewCommentReply:(n)=>this.request("POST",`/repos/${n.owner}/${n.repo}/pulls/${n.pull_number}/comments`,void 0,{body:n.body,in_reply_to:n.in_reply_to}),getComment:(n)=>this.request("GET",`/repos/${n.owner}/${n.repo}/pulls/comments/${n.comment_id}`),updateComment:(n)=>this.request("PATCH",`/repos/${n.owner}/${n.repo}/pulls/comments/${n.comment_id}`,void 0,{body:n.body})};repos={get:(n)=>this.request("GET",`/repos/${n.owner}/${n.repo}`)};async request(n,h,f,o){let a=`${this.baseUrl}${h}`;if(f){let i=new URLSearchParams;for(let[s,R]of Object.entries(f))i.set(s,String(R));a+=`?${i.toString()}`}let u={Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","User-Agent":"infer-action"};if(this.token)u.Authorization=`Bearer ${this.token}`;if(o!==void 0)u["Content-Type"]="application/json";let w=await this.fetchImpl(a,{method:n,headers:u,...o!==void 0?{body:JSON.stringify(o)}:{}});if(!w.ok){let i=await w.text().catch(()=>"");throw Error(`GitHub API ${n} ${h} -> ${w.status} ${w.statusText}: ${i.slice(0,300)}`)}if(w.status===204)return{data:void 0};return{data:await w.json()}}}var X="<!-- infer:plan-end -->",Z="<!-- infer:result-start -->",hn="<!-- infer:spinner -->",P="<!-- /infer:spinner -->",fn=`${hn}<img src="https://raw.githubusercontent.com/inference-gateway/infer-action/main/assets/spinner.svg" width="22" height="22" alt="Working" />${P}`;function x(n){let h=n.indexOf(hn);if(h===-1)return n;let f=n.indexOf(P,h);if(f===-1)return n;let o=f+P.length;while(o<n.length&&(n[o]===`
`||n[o]==="\r"))o++;return n.slice(0,h)+n.slice(o)}function p(n){let h=n.indexOf(X),f=n.indexOf(Z);if(h===-1&&f===-1)return{plan:n,middle:"",result:""};if(h===-1)return{plan:n.slice(0,f),middle:"",result:n.slice(f+Z.length)};if(f===-1)return{plan:n.slice(0,h),middle:n.slice(h+X.length),result:""};return{plan:n.slice(0,h),middle:n.slice(h+X.length,f),result:n.slice(f+Z.length)}}function nn(n){let h=n.plan.trim(),f=n.middle.trim(),o=n.result.trim();if(!f&&!o)return h;let a=h;if(a+=`

${X}`,f)a+=`

${f}`;if(a+=`

${Z}`,o)a+=`

${o}`;return a}class M{api;redactor;dryRun;owner;repoName;constructor(n){this.api=n.api??new z({token:n.token}),this.redactor=n.redactor,this.dryRun=n.dryRun??!1;let[h,f]=n.repo.split("/");if(!h||!f)throw Error(`Invalid repo string "${n.repo}", expected "owner/name"`);this.owner=h,this.repoName=f}commentUrl(n){return`https://github.com/${this.owner}/${this.repoName}/issues/comments/${n}`}issueUrl(n){return`https://github.com/${this.owner}/${this.repoName}/issues/${n}`}prUrl(n){return`https://github.com/${this.owner}/${this.repoName}/pull/${n}`}async getCommentBody(n){return(await this.api.issues.getComment({owner:this.owner,repo:this.repoName,comment_id:n})).data.body??""}async updateCommentBody(n,h){let f=this.redactor?this.redactor.redact(h):h;if(this.dryRun){console.log(`[dry-run] would update comment #${n} (${this.commentUrl(n)}):
${f}`);return}await this.api.issues.updateComment({owner:this.owner,repo:this.repoName,comment_id:n,body:f})}async createIssueComment(n,h){let f=this.redactor?this.redactor.redact(h):h;if(this.dryRun){console.log(`[dry-run] would create a github issue comment on issue #${n} (${this.issueUrl(n)}):
${f}`);return}await this.api.issues.createComment({owner:this.owner,repo:this.repoName,issue_number:n,body:f})}async createReviewCommentReply(n,h,f){let o=this.redactor?this.redactor.redact(f):f;if(this.dryRun){console.log(`[dry-run] would create a review comment reply on PR #${n} in reply to #${h}:
${o}`);return}await this.api.pulls.createReviewCommentReply({owner:this.owner,repo:this.repoName,pull_number:n,body:o,in_reply_to:h})}async getReviewCommentBody(n){return(await this.api.pulls.getComment({owner:this.owner,repo:this.repoName,comment_id:n})).data.body??""}async updateReviewCommentBody(n,h){let f=this.redactor?this.redactor.redact(h):h;if(this.dryRun){console.log(`[dry-run] would update review comment #${n}:
${f}`);return}await this.api.pulls.updateComment({owner:this.owner,repo:this.repoName,comment_id:n,body:f})}async updateReviewZone(n,h,f){if(this.dryRun){let u=this.redactor?this.redactor.redact(f):f;console.log(`[dry-run] would update the ${h} zone of review comment #${n}:
${u}`);return}let o=await this.getReviewCommentBody(n),a=p(o);a[h]=f,await this.updateReviewCommentBody(n,nn(a))}async clearReviewSpinner(n){if(this.dryRun){console.log(`[dry-run] would clear the spinner on review comment #${n}`);return}let h=await this.getReviewCommentBody(n),f=x(h);if(f===h)return;await this.updateReviewCommentBody(n,f)}async updateZone(n,h,f){if(this.dryRun){let u=this.redactor?this.redactor.redact(f):f;console.log(`[dry-run] would update the ${h} zone of comment #${n} (${this.commentUrl(n)}):
${u}`);return}let o=await this.getCommentBody(n),a=p(o);a[h]=f,await this.updateCommentBody(n,nn(a))}async clearSpinner(n){if(this.dryRun){console.log(`[dry-run] would clear the spinner on comment #${n} (${this.commentUrl(n)})`);return}let h=await this.getCommentBody(n),f=x(h);if(f===h)return;await this.updateCommentBody(n,f)}async getOpenPrForBranch(n){let f=(await this.api.pulls.list({owner:this.owner,repo:this.repoName,head:`${this.owner}:${n}`,state:"open",per_page:1})).data[0];if(!f)return null;return{number:f.number,url:f.html_url,body:f.body??"",baseRef:f.base.ref}}async getPrForBranch(n){let h=await this.api.pulls.list({owner:this.owner,repo:this.repoName,head:`${this.owner}:${n}`,state:"all",per_page:20}),f=(w)=>({number:w.number,url:w.html_url,body:w.body??"",baseRef:w.base.ref,state:w.state==="open"?"open":"closed",merged:w.merged_at!=null}),o=h.data.find((w)=>w.state==="open");if(o)return f(o);let a=h.data.find((w)=>w.merged_at!=null);if(a)return f(a);let u=h.data[0];return u?f(u):null}async findPrsReferencingIssue(n){let f=(await this.api.issues.listEventsForTimeline({owner:this.owner,repo:this.repoName,issue_number:n,per_page:100})).data,o=new Map;for(let a of f){if(a.event!=="cross-referenced")continue;let u=a.source?.issue;if(!u||!u.pull_request||typeof u.number!=="number")continue;o.set(u.number,{number:u.number,url:u.html_url??"",state:u.state??"",headRef:"",baseRef:"",isDraft:u.draft??!1,title:u.title??""})}return[...o.values()]}async updatePullRequestBody(n,h){let f=this.redactor?this.redactor.redact(h):h;if(this.dryRun){console.log(`[dry-run] would update PR #${n} body (${this.prUrl(n)}):
${f}`);return}await this.api.pulls.update({owner:this.owner,repo:this.repoName,pull_number:n,body:f})}async createDraftPr(n){let h=this.redactor?this.redactor.redact(n.body):n.body;if(this.dryRun)return console.log(`[dry-run] would open a DRAFT PR ${n.head} -> ${n.base} titled "${n.title}":
${h}`),{number:0,url:"(dry-run)",body:h,baseRef:n.base};let f=await this.api.pulls.create({owner:this.owner,repo:this.repoName,head:n.head,base:n.base,title:n.title,body:h,draft:!0});return{number:f.data.number,url:f.data.html_url,body:f.data.body??"",baseRef:f.data.base.ref}}async getDefaultBranch(){return(await this.api.repos.get({owner:this.owner,repo:this.repoName})).data.default_branch}async getPullRequest(n){let h=await this.api.pulls.get({owner:this.owner,repo:this.repoName,pull_number:n});return{title:h.data.title,body:h.data.body??"",headRef:h.data.head.ref,headRepoFullName:h.data.head.repo?.full_name??"",baseRef:h.data.base.ref}}async listIssueComments(n){let h=[],f=2;for(let o=1;o<=2;o++){let a=await this.api.issues.listComments({owner:this.owner,repo:this.repoName,issue_number:n,per_page:100,page:o});for(let u of a.data)h.push({id:u.id,author:u.user?.login??"unknown",body:u.body??"",createdAt:u.created_at});if(a.data.length<100)break}return h}async listReviewComments(n){let h=[],f=2;for(let o=1;o<=2;o++){let a=await this.api.pulls.listComments({owner:this.owner,repo:this.repoName,pull_number:n,per_page:100,page:o});for(let u of a.data)h.push({id:u.id,author:u.user?.login??"unknown",body:u.body??"",createdAt:u.created_at,inReplyToId:u.in_reply_to_id??0});if(a.data.length<100)break}return h}}function on(n){return{stdout:n.INFER_MIRROR_AGENT_LOGS==="true",stderr:!0}}import rn from"readline";async function*an(n){let h=rn.createInterface({input:n,crlfDelay:1/0});for await(let f of h){let o=f.trim();if(!o)continue;if(o[0]!=="{")continue;try{let a=JSON.parse(o);if(typeof a!=="object"||a===null)continue;let{role:u,type:w}=a;if(typeof u==="string"||w==="session_stats"||w==="compaction_started"||w==="compaction_completed")yield a}catch{}}}async function un(n,h){let f=n.INFER_CONTEXT_KIND;if(!f)throw Error("Missing required env var INFER_CONTEXT_KIND");if(f==="issue")return ln(n,h);if(f==="pull_request")return vn(n,h);if(f==="direct")return _n(n);throw Error(`Unknown INFER_CONTEXT_KIND "${f}" (expected "issue", "pull_request", or "direct")`)}function wn(n){let h=n.INFER_CONTEXT_KIND;if(h==="direct")return{kind:"direct",prompt:(n.INFER_DIRECT_PROMPT??"").trim()||"(dry-run: no prompt)"};if(h==="pull_request"){let f=sn(n),o=f?A(n):void 0;return{kind:"pull_request",prNumber:Number.parseInt(n.INFER_ISSUE_NUMBER??"0",10)||0,prTitle:"(dry-run: PR title unavailable)",prBody:"",headRef:"(unknown)",baseRef:"main",headRepoFullName:"",isFork:!1,triggeringCommentId:o?.id??0,comments:o?[{id:o.id,author:o.author,body:o.body,createdAt:"",isTrigger:!0}]:[],...f?{reviewComment:f}:{}}}return{kind:"issue",issueNumber:Number.parseInt(n.INFER_ISSUE_NUMBER??"0",10)||0,issueTitle:n.INFER_ISSUE_TITLE??"",issueBody:n.INFER_ISSUE_BODY??""}}function _n(n){let h=(n.INFER_DIRECT_PROMPT??"").trim();if(!h)throw Error("Missing or empty INFER_DIRECT_PROMPT for direct context");return{kind:"direct",prompt:h}}async function ln(n,h){let f=Number.parseInt(n.INFER_ISSUE_NUMBER??"",10);if(!Number.isFinite(f))throw Error("Missing or invalid INFER_ISSUE_NUMBER");let o=n.INFER_ISSUE_TITLE??"",a=n.INFER_ISSUE_BODY??"",u=A(n),[{associatedPrs:w,associatedBranches:i},s]=await Promise.all([Sn(h,f),Nn(h,f,u?.id??0)]);return{kind:"issue",issueNumber:f,issueTitle:o,issueBody:a,...u?{triggeringComment:u}:{},...w.length?{associatedPrs:w}:{},...i.length?{associatedBranches:i}:{},...s.length?{threadComments:s}:{}}}async function Nn(n,h,f){try{return(await n.listIssueComments(h)).map((a)=>({id:a.id,author:a.author,body:a.body,createdAt:a.createdAt,isTrigger:f>0&&a.id===f}))}catch(o){return console.warn(`[context] failed to list comments for issue #${h}; proceeding without the thread:`,o instanceof Error?o.message:o),[]}}async function Sn(n,h){let f=`fix/issue-${h}`;try{let[o,a]=await Promise.all([n.getOpenPrForBranch(f),n.findPrsReferencingIssue(h)]),u=new Map;for(let s of a)u.set(s.number,s);if(o){let s=u.get(o.number);u.set(o.number,{number:o.number,url:s?.url||o.url,state:s?.state||"open",headRef:f,baseRef:o.baseRef,isDraft:s?.isDraft??!1,title:s?.title??""})}return{associatedPrs:[...u.values()],associatedBranches:o?[f]:[]}}catch(o){return console.warn(`[context] failed to gather existing work for issue #${h}; proceeding without it:`,o instanceof Error?o.message:o),{associatedPrs:[],associatedBranches:[]}}}async function vn(n,h){let f=Number.parseInt(n.INFER_ISSUE_NUMBER??"",10);if(!Number.isFinite(f))throw Error("Missing or invalid INFER_ISSUE_NUMBER for PR context");let o=Number.parseInt(n.INFER_TRIGGERING_COMMENT_ID??"",10),a=Number.isFinite(o)?o:0,u=sn(n),[w,i]=await Promise.all([h.getPullRequest(f),u?In(n,h,f,a):h.listIssueComments(f).then((G)=>G.map(($)=>({id:$.id,author:$.author,body:$.body,createdAt:$.createdAt,isTrigger:a>0&&$.id===a})))]),s=`${h.owner}/${h.repoName}`,R=w.headRepoFullName!==""&&w.headRepoFullName!==s;return{kind:"pull_request",prNumber:f,prTitle:w.title,prBody:w.body,headRef:w.headRef,baseRef:w.baseRef,headRepoFullName:w.headRepoFullName,isFork:R,triggeringCommentId:a,comments:i,...u?{reviewComment:u}:{}}}function sn(n){let h=(n.INFER_REVIEW_COMMENT_PATH??"").trim();if(!h)return;let f=Number.parseInt(n.INFER_REVIEW_COMMENT_LINE??"",10),o=Number.parseInt(n.INFER_REVIEW_COMMENT_START_LINE??"",10);return{path:h,diffHunk:n.INFER_REVIEW_COMMENT_DIFF_HUNK??"",...Number.isFinite(f)?{line:f}:{},...Number.isFinite(o)?{startLine:o}:{}}}async function In(n,h,f,o){let a=Number.parseInt(n.INFER_REVIEW_COMMENT_IN_REPLY_TO??"",10),u=[];if(Number.isFinite(a)&&a>0){let w=await h.listReviewComments(f);for(let i of w)if(i.id===a||i.inReplyToId===a)u.push({id:i.id,author:i.author,body:i.body,createdAt:i.createdAt,isTrigger:o>0&&i.id===o})}if(!u.some((w)=>w.isTrigger)){let w=A(n);if(w)u.push({id:w.id,author:w.author,body:w.body,createdAt:"",isTrigger:!0})}return u}function A(n){let h=n.INFER_TRIGGERING_COMMENT_ID??"",f=n.INFER_TRIGGERING_COMMENT_BODY??"",o=n.INFER_TRIGGERING_COMMENT_AUTHOR??"",a=Number.parseInt(h,10);if(!Number.isFinite(a)||a<=0)return;if(!f.trim())return;return{id:a,body:f,author:o}}var L=["GITHUB_TOKEN","OLLAMA_API_KEY","OLLAMA_CLOUD_API_KEY","GROQ_API_KEY","OPENAI_API_KEY","CLOUDFLARE_API_KEY","COHERE_API_KEY","ANTHROPIC_API_KEY","DEEPSEEK_API_KEY","GOOGLE_API_KEY","MISTRAL_API_KEY","MINIMAX_API_KEY","MOONSHOT_API_KEY","NVIDIA_API_KEY","ZAI_API_KEY","OTEL_EXPORTER_OTLP_HEADERS","MEMORY_TOKEN","MEMORY_DEPLOY_KEY"],Cn=["-----BEGIN [A-Z ]*PRIVATE KEY( BLOCK)?-----[\\s\\S]+?-----END [A-Z ]*PRIVATE KEY( BLOCK)?-----"],gn=["github_pat_[A-Za-z0-9_]{82,}","gh[pours]_[A-Za-z0-9]{36,}","AIza[0-9A-Za-z_-]{35}","xox[bpoa]-[A-Za-z0-9-]{20,}","sk-[A-Za-z0-9_-]{20,}","eyJ[A-Za-z0-9_-]+\\.eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]{10,}"];var en=/[.*+?^${}()|[\]\\]/g;function E(n,h,f=8){let o=[],a=new Set;for(let u of h){let w=n[u];if(typeof w!=="string")continue;if(w.trim().length<f)continue;if(a.has(w))continue;a.add(w),o.push(w)}return o}function kn(n){let h=new Set;for(let f of n){if(!f||h.has(f))continue;h.add(f),process.stdout.write(`::add-mask::${f}
`)}}function Rn(n={}){let h=n.placeholder??"***",f=n.minLength??8,o=n.env??process.env,a=n.heuristics??!1,u=E(o,L,f);u.sort((s,R)=>R.length-s.length);let w=u.map(tn);if(w.push(...Cn),a)w.push(...gn);let i=w.length>0?new RegExp(w.join("|"),"g"):null;return{secretCount:u.length,redact(s){if(!i||!s)return s;return s.replace(i,h)}}}function tn(n){return n.replace(en,"\\$&")}var V="/tmp/agent-output.txt",B="/tmp/infer-todos.json",r="/tmp/infer-cancelled";function Q(n){let h=process.env[n];if(!h)throw Error(`Missing required env var ${n}`);return h}function y(n){return process.env[n]??""}function Wn(){let n=y("INFER_DRY_RUN")==="true",h=n?y("GITHUB_TOKEN"):Q("GITHUB_TOKEN"),f=Q("INFER_REPO"),o=y("INFER_ENABLE_GIT_OPERATIONS")!=="false",a=y("INFER_REDACT_HEURISTICS")==="true",u=E(process.env,L);kn(u);let w=Rn({env:process.env,heuristics:a}),i=new M({token:h,repo:f,redactor:w,dryRun:n});return{dryRun:n,token:h,repo:f,enableGitOps:o,enableHeuristics:a,redactor:w,github:i}}async function yn(n,h,f){try{return await un(n,h)}catch(o){if(f.failHard)throw o;return console.warn(`[${f.stepName}] context read failed (${o.message}); proceeding with env-derived data`),wn(n)}}var Yn={SYSTEM_DIRECT:`# Infer Agent (manual run)

You are running in CI from a manual dispatch. There is no GitHub issue
or pull request thread - your task is the free-text prompt below, and
your result is captured in the workflow job summary. The runner
filesystem is ephemeral - any change you do not commit and push to a
remote branch is lost when the job ends.

## Working style

Track your plan with TodoWrite and update it as you go. There is no
issue/PR comment to mirror to; your progress shows in the job log and
your final summary is posted to the job summary automatically.

If a tool call fails (an Edit that does not apply, a rejected command),
the change did NOT happen. Re-read the file, fix the call, and retry -
never mark a todo completed based on a failed call.

To read a file in another repository, use \`gh api repos/<owner>/<repo>/contents/<path>\`,
\`gh repo view\`, \`gh pr view\`, or \`gh issue view\`. Reserve \`gh search code\`
(heavily rate-limited) for when the location is genuinely unknown - one
or two queries at most.

If a CLI call fails with "unknown flag", the usage text in the error is
the authoritative flag list - pick from it instead of guessing.

For questions or discussion (no code changes), just answer and stop -
skip the steps below. Your answer is your final output.

## Code changes

Follow this order. Do NOT defer commits to the end of the run. NEVER
commit on or push to \`main\`/\`master\` - branch protection rejects the
push and the work is stranded.

1. BEFORE any file edits, create and push a working branch off the
   default branch, prefixed \`feature/\` (or \`fix/\` for a bug fix) with a
   short kebab-case name (for example \`feature/add-rate-limit-header\`):

       git checkout -B feature/<short-description>
       git push -u origin feature/<short-description>

   Edits made before this step succeeds are lost. Before your first
   edit, \`git branch --show-current\` must NOT report \`main\` or \`master\`.

2. AFTER each TodoWrite item you flip to "completed", validate then commit:

       <run the repo's checks and fix any failures>
       git add -A
       git commit -m "<type>(<scope>): <description>"
       git push origin feature/<short-description>

   Push your working branch by name - never \`main\`. Run the repository's
   own checks - lint, format, type-check, tests, whatever it provides -
   and fix failures before each commit; CI runs only AFTER this job
   ends. Do not batch commits: the job has a turn limit, and deferred
   work is destroyed when the runner ends.

3. As soon as your FIRST commit is pushed, open the pull request as a
   DRAFT. Do this early - not at the end - so interrupted work survives
   as a PR. Write the description to a file with the Write tool (avoids
   shell-quoting problems), then pass it with --body-file:

       <use the Write tool to write the PR description to /tmp/pr-body.md>

       gh pr create --draft \\
         --title "<type>(<scope>): <what changed>" \\
         --body-file /tmp/pr-body.md

   \`gh pr create\` targets the repository's default branch and takes the
   head from your current branch. Write /tmp/pr-body.md from the actual
   diff. It must contain:

       ## Summary
       <2-4 sentences: what changed and why>

       ## Changes
       <bullet list of the notable changes>

   A one-line body is NOT acceptable - the ## Summary and ## Changes
   sections are required.

4. When ALL your work is committed and pushed and the repo's checks
   pass, mark the PR ready for review:

       gh pr ready

   Do NOT merge, close, edit, or review the PR. Never run \`gh pr merge\`,
   \`gh pr close\`, \`gh pr edit\`, or \`gh pr review\` - a human reviews and
   merges. Low on turns or context? Stop starting new work, commit and
   push everything, and leave the PR a draft for a human to pick up.

Use Conventional Commits: \`type(scope): description\` (feat, fix, docs,
style, refactor, test, chore).

## Before you finish

If you changed files, verify each of these and fix what fails before
ending the run:

1. \`git status\` - clean tree; commit and push anything left.
2. \`git status -sb\` - no "[ahead"; if shown, \`git push\`.
3. \`gh pr view\` - succeeds; if not, create the draft PR now (step 3).

Question-only runs skip this.

## Output

End with a one-sentence summary of what you changed (or what you found,
if no changes). Your summary and the run's result are posted to the
workflow job summary - do not call any GitHub APIs to report.

## Environment

- \`gh\` is authenticated via GITHUB_TOKEN; \`git\` is configured as
  github-actions[bot]; full file access to the checkout.
- The runner is ephemeral - unpushed commits are lost when the job ends.`,SYSTEM_ISSUE:`# GitHub Issue Agent

You are running in CI on issue #{{issueNumber}}. The runner filesystem is
ephemeral - any change you do not commit and push to a remote branch is
lost when the job ends.

## Working style

Track your plan with TodoWrite and update it as you go - the runner
mirrors your todos to the issue comment, so do not comment on the issue
yourself.

Todos render as Markdown there: \`#123\` links issue/PR 123 and \`@name\`
pings a real user. Write them only when you mean that exact issue, PR, or
person; for ordinary numbering write "step 1" or "PR 96" so you never
link an unrelated or non-existent ticket.

If a tool call fails (an Edit that does not apply, a rejected command),
the change did NOT happen. Re-read the file, fix the call, and retry -
never mark a todo completed based on a failed call.

To read a file in another repository, use \`gh api repos/<owner>/<repo>/contents/<path>\`,
\`gh repo view\`, \`gh pr view\`, or \`gh issue view\`. Reserve \`gh search code\`
(heavily rate-limited) for when the location is genuinely unknown - one
or two queries at most.

If a CLI call fails with "unknown flag", the usage text in the error is
the authoritative flag list - pick from it instead of guessing.

For questions or discussion (no code changes), just answer and stop -
skip the steps below.

## Code changes

Follow this order. Do NOT defer commits to the end of the run. NEVER
commit on or push to \`main\`/\`master\` - branch protection rejects the
push and the work is stranded.

1. BEFORE any file edits, get onto the working branch - edits made
   before this step succeeds are lost.

   No existing work for this issue (no "Existing work for this issue"
   section in the task, no \`fix/issue-{{issueNumber}}\` branch on the
   remote)? Create and push the branch now:

       git checkout -B fix/issue-{{issueNumber}}
       git push -u origin fix/issue-{{issueNumber}}

   Otherwise CONTINUE the existing work - build on top of it, do NOT
   reset it:

       gh pr checkout <number>                       # for a linked PR, or:
       git fetch origin fix/issue-{{issueNumber}} && git checkout fix/issue-{{issueNumber}}

   Never run \`git checkout -B\` against an existing branch - that throws
   away the prior commits. Already on another branch? Stay on it. Before
   your first edit, \`git branch --show-current\` must NOT report \`main\`
   or \`master\`.

2. AFTER each TodoWrite item you flip to "completed", validate then commit:

       <run the repo's checks and fix any failures>
       git add -A
       git commit -m "<type>(<scope>): <description>"
       git push origin fix/issue-{{issueNumber}}

   (If step 1 put you on a different branch, push that branch by name -
   never \`main\`.) Run the repository's own checks - lint, format,
   type-check, tests, whatever it provides - and fix failures before
   each commit; CI runs only AFTER this job ends. Do not batch commits:
   the job has a turn limit, and deferred work is destroyed when the
   runner ends.

3. As soon as your FIRST commit is pushed, make sure a DRAFT pull
   request exists. Open it early - not at the end - so interrupted work
   survives as a PR. Write the description to a file with the Write tool
   (avoids shell-quoting problems), then pass it with --body-file:

       <use the Write tool to write the PR description to /tmp/pr-body.md>

       gh pr create --draft --base main --head fix/issue-{{issueNumber}} \\
         --title "<type>(<scope>): <what changed>" \\
         --body-file /tmp/pr-body.md

   If you continued an existing PR/branch (step 1), one is already open -
   keep pushing to it; do NOT run \`gh pr create\` again.

   Write /tmp/pr-body.md from the actual diff. It must contain:

       Resolves #{{issueNumber}}

       ## Summary
       <2-4 sentences: what changed and why>

       ## Changes
       <bullet list of the notable changes>

   A one-line body is NOT acceptable - the ## Summary and ## Changes
   sections are required.

4. When ALL your work is committed and pushed and the repo's checks
   pass, mark the PR ready for review:

       gh pr ready

   Do NOT merge, close, edit, or review the PR. Never run \`gh pr merge\`,
   \`gh pr close\`, \`gh pr edit\`, or \`gh pr review\` - a human reviews and
   merges. Low on turns or context? Stop starting new work, commit and
   push everything, and leave the PR a draft for a human to pick up.

Use Conventional Commits: \`type(scope): description\` (feat, fix, docs,
style, refactor, test, chore).

## Before you finish

If you changed files, verify each of these and fix what fails before
ending the run:

1. \`git status\` - clean tree; commit and push anything left.
2. \`git status -sb\` - no "[ahead"; if shown, \`git push\`.
3. \`gh pr view\` - succeeds; if not, create the draft PR now (step 3).

Question-only runs skip this.

## Output

End with a one-sentence summary of what you changed (or what you found,
if no changes). Do not call any GitHub comment APIs - the runner posts
your result.

## Environment

- \`gh\` is authenticated via GITHUB_TOKEN; \`git\` is configured as
  github-actions[bot]; full file access to the checkout.
- The runner is ephemeral - unpushed commits are lost when the job ends.`,SYSTEM_PR_FORK:`# GitHub PR Agent (view-only)

You are running in CI on PR #{{prNumber}}. The PR's head branch
\`{{headRef}}\` lives in a fork (\`{{headRepoFullName}}\`) and has been
fetched read-only for you to inspect.

## Working style

Track your plan with TodoWrite and update it as you go - the runner
mirrors your todos to the PR comment.

Todos render as Markdown there: \`#123\` links issue/PR 123 and \`@name\`
pings a real user. Write them only when you mean that exact issue, PR, or
person; for ordinary numbering write "step 1" or "PR 96" so you never
link an unrelated or non-existent ticket.

The user's latest ask is in the "Triggering comment" section of your
task. Address that ask directly.

To read a file in another repository, use \`gh api repos/<owner>/<repo>/contents/<path>\`,
\`gh repo view\`, \`gh pr view\`, or \`gh issue view\`. Reserve \`gh search code\`
(heavily rate-limited) for when the location is genuinely unknown - one
or two queries at most.

If a CLI call fails with "unknown flag", the usage text in the error is
the authoritative flag list - pick from it instead of guessing.

## You cannot commit or push

This PR's head lives in a fork the runner cannot write to.
DO NOT run \`git commit\`, \`git push\`, \`gh pr create\`, \`gh pr merge\`,
\`gh pr close\`, \`gh pr edit\`, or \`gh pr review\`. Any attempt will fail.

Instead: read files, run \`git diff origin/{{baseRef}}...HEAD\`,
\`git log\`, and the repo's own checks (lint, tests) to investigate.
Answer the user's question or summarise findings.

## Output

End with a one-sentence summary of what you found. Do not call any
GitHub comment APIs - the runner posts your result.

## Environment

- \`gh\` is authenticated via GITHUB_TOKEN (read access only on the fork's
  head branch).
- Full file access to the checkout, on a detached read-only copy of the
  fork's head.
- The runner is ephemeral.`,SYSTEM_PR:`# GitHub PR Agent

You are running in CI on PR #{{prNumber}}. The PR's head branch
\`{{headRef}}\` is already checked out. The runner filesystem is ephemeral -
any change you do not commit and push is lost when the job ends.

## Working style

Track your plan with TodoWrite and update it as you go - the runner
mirrors your todos to the PR comment, so do not comment on the PR
yourself.

Todos render as Markdown there: \`#123\` links issue/PR 123 and \`@name\`
pings a real user. Write them only when you mean that exact issue, PR, or
person; for ordinary numbering write "step 1" or "PR 96" so you never
link an unrelated or non-existent ticket.

If a tool call fails (an Edit that does not apply, a rejected command),
the change did NOT happen. Re-read the file, fix the call, and retry -
never mark a todo completed based on a failed call.

To read a file in another repository, use \`gh api repos/<owner>/<repo>/contents/<path>\`,
\`gh repo view\`, \`gh pr view\`, or \`gh issue view\`. Reserve \`gh search code\`
(heavily rate-limited) for when the location is genuinely unknown - one
or two queries at most.

If a CLI call fails with "unknown flag", the usage text in the error is
the authoritative flag list - pick from it instead of guessing.

The user's latest ask is in the "Triggering comment" section of your
task. Address that ask directly. Do NOT re-implement existing changes
unless asked.

For questions or discussion (no code changes), just answer and stop -
skip the steps below.

## Code changes

Follow this order. Do NOT defer commits to the end of the run.

1. You are ALREADY on branch \`{{headRef}}\`. DO NOT create a new branch.
   DO NOT run \`git checkout -b\` or \`git checkout -B\`. Verify with
   \`git rev-parse --abbrev-ref HEAD\` if uncertain - it must report
   \`{{headRef}}\`.

2. AFTER each TodoWrite item you flip to "completed", validate then commit:

       <run the repo's checks and fix any failures>
       git add -A
       git commit -m "<type>(<scope>): <description>"
       git push

   Run the repository's own checks - lint, format, type-check, tests,
   whatever it provides - and fix failures before each commit; CI runs
   only AFTER this job ends. Do not batch commits: the job has a turn
   limit, and deferred work is destroyed when the runner ends.

3. The pull request ALREADY EXISTS (PR #{{prNumber}}). DO NOT run
   \`gh pr create\`. DO NOT run \`gh pr merge\`, \`gh pr close\`, or
   \`gh pr review\`. You MAY update this PR's title and description with
   \`gh pr edit {{prNumber}} --title ... --body ...\` when the task calls
   for it. Your pushes to \`{{headRef}}\` update the PR automatically. Low
   on turns or context? Stop starting new work and make sure everything
   is committed and pushed - your pushes are the PR.

Use Conventional Commits: \`type(scope): description\` (feat, fix, docs,
style, refactor, test, chore).

Before you finish, if you changed files: \`git status\` must be clean and
\`git status -sb\` must show no "[ahead" - commit and push anything left.

## Output

End with a one-sentence summary of what you changed (or what you found,
if no changes). Do not call any GitHub comment APIs - the runner posts
your result.

## Environment

- \`gh\` is authenticated via GITHUB_TOKEN; \`git\` is configured as
  github-actions[bot]; full file access, already on the PR head branch.
- The runner is ephemeral - unpushed commits are lost when the job ends.`,TASK_DIRECT:`Complete the following task in this repository. It was dispatched manually; there is no associated GitHub issue or pull request to reply to.

{{prompt}}`,TASK_ISSUE:`Resolve the following GitHub issue:

Issue #{{issueNumber}}: {{issueTitle}}

{{issueBody}}{{existingWorkSection}}{{recentCommentsSection}}{{triggeringCommentSection}}`,TASK_PR_REVIEW:`Address the following inline review comment on a pull request.

PR #{{prNumber}}: {{prTitle}}
Head branch: {{headRef}} (base: {{baseRef}}){{forkNotice}}

## Code section under review

### \`{{filePath}}\`{{lineInfo}}

\`\`\`diff
{{diffHunk}}
\`\`\`
{{threadSection}}{{triggerSection}}

Focus ONLY on this code section and what the comment asks. Do not review or rework the rest of the pull request. If the comment carries a \`\`\`suggestion block, apply it verbatim unless it is clearly broken - and say so if it is. Run \`git diff origin/{{baseRef}}...HEAD\` if you need the surrounding changes for context.`,TASK_PR:`Continue work on the following pull request.

PR #{{prNumber}}: {{prTitle}}
Head branch: {{headRef}} (base: {{baseRef}}){{forkNotice}}

## Description

{{prBody}}{{otherCommentsSection}}

## Changed files

{{diffStatSection}}

Run \`git diff origin/{{baseRef}}...HEAD\` for the full diff and \`git log origin/{{baseRef}}..HEAD\` for the commit history.{{triggerSection}}`};function bn(n){let h=process.env[`INFER_PROMPT_OVERRIDE_${n}`];return h&&h.trim()?h:Yn[n]}function dn(n){let h=process.env[`INFER_PROMPT_OVERRIDE_${n}`];return h&&h.trim()?h:null}var mn={SYSTEM_ISSUE:["git commit","git push","gh pr create","gh pr ready","git status"],SYSTEM_DIRECT:["git commit","git push","gh pr create","gh pr ready","git status"],SYSTEM_PR:["git commit","git push","git status"],SYSTEM_PR_FORK:["git commit","git push"]};function cn(n){if(n.kind==="issue")return"SYSTEM_ISSUE";if(n.kind==="direct")return"SYSTEM_DIRECT";if(n.isFork)return"SYSTEM_PR_FORK";return"SYSTEM_PR"}function qn(n){let h=cn(n),f=dn(h);if(f===null)return[];let o=mn[h];if(!o||o.length===0)return[];let a=o.filter((u)=>!f.includes(u));return a.length>0?[{key:h,missing:a}]:[]}function H(n,h={}){return bn(n).replace(/\{\{(\w+)\}\}/g,(f,o)=>{if(!(o in h))throw Error(`Missing variable "${o}" for prompt "${n}"`);return String(h[o])})}function Hn(n,h={}){if(n.kind==="issue")return nh(n);if(n.kind==="direct")return pn(n);return fh(n,h.diffStat??"")}function $n(n,h){let f=xn(n);if(h.trim())return`${f}

## Additional Instructions

${h}`;return f}function xn(n){if(n.kind==="issue")return H("SYSTEM_ISSUE",{issueNumber:n.issueNumber});if(n.kind==="direct")return H("SYSTEM_DIRECT");if(n.isFork)return H("SYSTEM_PR_FORK",{prNumber:n.prNumber,headRef:n.headRef,headRepoFullName:n.headRepoFullName,baseRef:n.baseRef});return H("SYSTEM_PR",{prNumber:n.prNumber,headRef:n.headRef})}function pn(n){return H("TASK_DIRECT",{prompt:n.prompt})}function nh(n){let h=n.triggeringComment?`

## Triggering comment from @${n.triggeringComment.author}

${n.triggeringComment.body}

Treat this comment as the user's most recent intent. If it asks for something more specific than the issue body, prioritise it.`:"";return H("TASK_ISSUE",{issueNumber:n.issueNumber,issueTitle:n.issueTitle,issueBody:n.issueBody,existingWorkSection:hh(n),recentCommentsSection:Dn((n.threadComments??[]).filter((f)=>!f.isTrigger),"Recent comments (chronological)"),triggeringCommentSection:h})}function Dn(n,h){let f=n.filter((w)=>!w.author.endsWith("[bot]")),o=f.slice(-3);if(o.length===0)return"";let a=f.length-o.length,u=a>0?`_\u2026${a} earlier comment${a===1?"":"s"} omitted_

`:"";return`

## ${h}

${u}${o.map(On).join(`

`)}`}function hh(n){let h=n.associatedPrs??[],f=n.associatedBranches??[];if(h.length===0&&f.length===0)return"";let o=["## Existing work for this issue","A prior run or another contributor may already have started on this issue. Before creating a branch, inspect the items below and CONTINUE from them if they contain relevant work - check it out (`gh pr checkout <number>`, or `git fetch origin <branch> && git checkout <branch>`) and build on top of it rather than starting fresh. Only start a new branch if none of these apply."];if(h.length){let a=h.map((u)=>{let w=u.isDraft?" (draft)":"",i=u.state&&u.state!=="open"?` [${u.state}]`:"",s=u.headRef?` - branch \`${u.headRef}\``:"",R=u.title?` - ${u.title}`:"";return`- PR #${u.number}${w}${i}${s}: ${u.url}${R}`});o.push(`### Pull requests

`+a.join(`
`))}if(f.length)o.push(`### Branches

`+f.map((a)=>`- \`${a}\``).join(`
`));return`

`+o.join(`

`)}function fh(n,h){let f=n.isFork?`
Head lives in a fork: ${n.headRepoFullName}. You CANNOT push commits to it from this runner.`:"",o=n.comments.find((R)=>R.isTrigger),a=o?`

## Triggering comment from @${o.author} (id: ${o.id})

${o.body}

This is the user's most recent ask. Address it directly. Do not re-implement existing changes unless this comment asks for that.`:"",u=n.comments.filter((R)=>!R.isTrigger);if(n.reviewComment)return oh(n,n.reviewComment,{forkNotice:f,triggerSection:a,others:u});let w=Dn(u,"Other comments (chronological)"),i=n.prBody.trim()?n.prBody:"_(no description)_",s=h.trim()?"```\n"+h.trim()+"\n```":"_(no changes on this branch yet)_";return H("TASK_PR",{prNumber:n.prNumber,prTitle:n.prTitle,headRef:n.headRef,baseRef:n.baseRef,forkNotice:f,prBody:i,triggerSection:a,otherCommentsSection:w,diffStatSection:s})}function oh(n,h,f){let o=h.startLine&&h.line&&h.startLine!==h.line?`, lines ${h.startLine}-${h.line}`:h.line?`, line ${h.line}`:"",a=f.others.length>0?`

## Earlier comments in this review thread

${f.others.map(On).join(`

`)}`:"";return H("TASK_PR_REVIEW",{prNumber:n.prNumber,prTitle:n.prTitle,headRef:n.headRef,baseRef:n.baseRef,forkNotice:f.forkNotice,filePath:h.path,lineInfo:o,diffHunk:h.diffHunk,threadSection:a,triggerSection:f.triggerSection})}function On(n){return`**@${n.author}** \xB7 ${n.createdAt}

${n.body}`}function ah(n,h){let f=[],o=h.enableGitOps&&!(n.kind==="pull_request"&&n.isFork);if(f.push({name:"infer-action-context",hook:"pre_stream",trigger:"interval",interval:5,text:h.enableGitOps?uh(n):"<system-reminder>Keep your TodoWrite plan current as you go. Only answering a question? Ignore this.</system-reminder>"}),o)f.push({name:"infer-action-wrap-up",hook:"pre_stream",trigger:"turns_before_max",threshold:10,text:wh(n)}),f.push({name:"infer-action-failed-tool",hook:"post_tool",trigger:"on_failure",text:ih()});return f}function uh(n){if(n.kind==="pull_request"&&n.isFork)return"<system-reminder>This PR is from a fork - you CANNOT commit or push. Investigate with file reads and git diff, then answer the user's question or summarise. Keep your TodoWrite plan current.</system-reminder>";if(n.kind==="pull_request")return`<system-reminder>Keep your TodoWrite plan current, and commit + push after each step so PR #${n.prNumber} stays current - unpushed work is lost when the job ends.</system-reminder>`;return"<system-reminder>Keep your TodoWrite plan current. Changing code? Work on a pushed branch with an open draft PR (`gh pr create --draft`) and commit + push after each step so nothing is lost - never commit on or push to main. Only answering a question? Ignore this.</system-reminder>"}function wh(n){return`<system-reminder>You are close to the turn limit. Stop starting new work - commit and push everything now ${n.kind==="pull_request"?`so PR #${n.prNumber} is up to date`:"and make sure the draft PR exists (`gh pr create --draft`)"}. Unpushed work is lost when the run ends.</system-reminder>`}function ih(){return"<system-reminder>That tool call FAILED - the change did NOT happen. Re-read or re-check, fix it, and retry. Never mark a todo done or claim success on a failed call.</system-reminder>"}function sh(n){let h=["enabled: true","merge: true","reminders:"];for(let f of n){if(h.push(`  - name: ${JSON.stringify(f.name)}`),h.push(`    hook: ${JSON.stringify(f.hook)}`),h.push(`    trigger: ${JSON.stringify(f.trigger)}`),f.interval!==void 0)h.push(`    interval: ${f.interval}`);if(f.threshold!==void 0)h.push(`    threshold: ${f.threshold}`);h.push(`    text: ${JSON.stringify(f.text)}`)}return h.join(`
`)+`
`}function Kn(n,h,f){let o=n.trim();if(o)return o.endsWith(`
`)?o:o+`
`;return sh(ah(h,f))}import{execFileSync as kh}from"child_process";import{appendFileSync as jn,existsSync as nf,readFileSync as Rh,rmSync as Wh,writeFileSync as yh}from"fs";var Yh=60000;function Jn(){try{yh(r,"1")}catch(n){console.error("[runner] failed to write cancel marker:",n)}}function Xn(){try{Wh(r,{force:!0})}catch{}}function Zn(n,h=_){try{return h(`git diff --stat origin/${qh(n)}...HEAD`)}catch(f){return console.error("[runner] git diff --stat failed:",f),""}}function Qn(n,h=(f)=>f){try{let a=Rh(V,"utf8").split(`
`).filter((u)=>u.trim()!=="").slice(-n);if(a.length===0)return;console.error("=========================================="),console.error(`[recover] last ${a.length} line(s) of agent activity before it stopped:`),console.error("------------------------------------------");for(let u of a){let w=u.length>2000?u.slice(0,2000)+" \u2026":u;console.error(h(w))}console.error("==========================================")}catch(f){console.error("[recover] could not read agent transcript for breadcrumb:",f)}}function _(n){return kh("bash",["-c",n],{encoding:"utf8",timeout:Yh,env:{...process.env,GIT_TERMINAL_PROMPT:"0"}})}function qh(n){return`'${n.replace(/'/g,"'\\''")}'`}function K(n,h){let f=process.env.GITHUB_OUTPUT;if(!f){console.log(`(would set output) ${n}=${h}`);return}if(h.includes(`
`)){let o=`_GHO_EOF_${Math.random().toString(36).slice(2)}`;jn(f,`${n}<<${o}
${h}
${o}
`)}else jn(f,`${n}=${h}
`)}function Gn(n){return typeof n==="object"&&n!==null&&n.role==="tool"&&typeof n.content==="string"}function Fn(n){if(typeof n!=="object"||n===null)return!1;let h=n.type;return h==="compaction_started"||h==="compaction_completed"}var Vn="Result of tool call: ";function Tn(n){if(!n.startsWith(Vn))return null;let h=n.slice(Vn.length);try{let f=JSON.parse(h);if(typeof f==="object"&&f!==null)return f;return null}catch{return null}}class l{handlers=new Map;flushers=[];listeners=[];on(n,h){return this.handlers.set(n,h),this}onMessage(n){return this.listeners.push(n),this}addFlusher(n){return this.flushers.push(n),this}async observe(n){for await(let h of n){for(let a of this.listeners)try{a(h)}catch(u){console.error("[ticker] message listener threw:",u)}if(!Gn(h))continue;let f=Tn(h.content);if(!f?.tool_name)continue;let o=this.handlers.get(f.tool_name);if(!o)continue;try{await o(f,h)}catch(a){console.error(`[ticker] handler for ${f.tool_name} threw:`,a)}}}async flush(){for(let n of this.flushers)try{await n()}catch(h){console.error("[ticker] flusher threw:",h)}}}function Un(n,h){let f=null,o=null,a=null,u=async()=>{if(o=null,!f)return;let w=f.value;f=null,a=n(w).catch((i)=>{console.error("[throttle] fn threw:",i)}).finally(()=>{a=null}),await a};return{call(w){if(f={value:w},!o)o=setTimeout(()=>{u()},h)},async flush(){if(o)clearTimeout(o),o=null;if(f)await u();else if(a)await a}}}function zn(n){let h=Math.floor(n/1000);if(h<60)return`${h}s`;let f=Math.floor(h/60),o=h%60;if(f<60)return`${f}m ${o}s`;let a=Math.floor(f/60),u=f%60;return`${a}h ${u}m ${o}s`}var Kh=1500;async function jh(){let{dryRun:n,enableGitOps:h,redactor:f,github:o}=Wn(),a=y("INFER_COOKING_COMMENT_ID"),u=a?Number.parseInt(a,10):0,w=Number.isFinite(u)&&u>0,i=y("INFER_COOKING_COMMENT_IS_REVIEW")==="true",s=y("INFER_WORKFLOW_URL"),R=Q("INFER_AGENT_MODEL"),G=y("INFER_CUSTOM_INSTRUCTIONS"),$=y("INFER_BASH_ALLOW_APPEND"),N=y("INFER_LOGGING_DEBUG")==="true",F=on(process.env),Y=await yn(process.env,o,{stepName:"dry-run",failHard:!n});if(Y.kind==="pull_request"&&h)try{Fh(Y)}catch(k){if(!n)throw k;console.warn("[dry-run] PR head checkout failed; continuing on the current branch:",k instanceof Error?k.message:k)}let Mn=Y.kind==="pull_request"?Zn(Y.baseRef):"",S=$n(Y,G),v=Hn(Y,{diffStat:Mn});if(h)for(let k of qn(Y)){let W=k.key.replace(/^SYSTEM_/,"").toLowerCase().replace(/_/g,"-");process.stdout.write(`::warning::INFER_PROMPT_OVERRIDE_${k.key} replaces the bundled system prompt (system-prompt-${W} / src/prompts/system-${W}.md) and is missing the git-safety markers: ${k.missing.join(", ")}. The default guards against lost work (branch-first, commit-per-todo, push, draft PR, finish checklist); your override dropped those instructions, so the agent may leave changes uncommitted or unpushed. Re-add them to your override, or use the custom-instructions input to layer extras on top of the default instead of replacing it.
`)}let An=y("INFER_REMINDERS_CONFIG"),I=Kn(An,Y,{enableGitOps:h}),C=c(h,$),T=y("INFER_BIN")||"infer",g=Jh(process.env,{systemPrompt:S,bashAllowAppend:C,remindersYaml:I});console.log("=========================================="),console.log("SYSTEM PROMPT:"),console.log("==========================================");let e=y("INFER_BIN")?void 0:Xh(T,g);if(console.log(e===void 0?S:Zh(e,N)),console.log("=========================================="),console.log(""),console.log("Running agent with task:"),console.log(v),console.log("---"),n)console.log("=========================================="),console.log("DRY RUN - the agent would be invoked with:"),console.log("=========================================="),console.log(`Model:        ${R}`),console.log(`Context kind: ${Y.kind}`),console.log(`Git ops:      ${h?"enabled":"disabled"}`),console.log(`INFER_BIN:    ${T}`),console.log("--- REMINDERS (INFER_REMINDERS_CONFIG) ---"),console.log(I),console.log("--- BASH ALLOW-LIST APPEND (added to the CLI read-only baseline) ---"),console.log(C||"(none - CLI read-only baseline only)"),console.log("==========================================");Ph(),Xn();let Ln=Date.now(),q=Hh(T,["agent","-m",R,v],{stdio:["inherit","pipe","pipe"],env:g});if(!q.stdout||!q.stderr)throw Error("child stdio not piped - this should not happen");let t=!1,b=!1,d=(k)=>{if(b)return;b=!0,t=!0,Jn(),console.error(`[runner] received ${k}; stopping the agent so the salvage step can recover its work`);try{q.kill("SIGKILL")}catch(W){console.error("[runner] failed to stop agent child:",W)}};process.once("SIGTERM",()=>d("SIGTERM")),process.once("SIGINT",()=>d("SIGINT"));let j=Dh(V),m=new Oh;if(q.stdout.pipe(j,{end:!1}),F.stdout)q.stdout.pipe(process.stdout,{end:!1});else console.log("[runner] agent stdout muted (set INFER_MIRROR_AGENT_LOGS=true to mirror); stderr still shown, full transcript written to /tmp/agent-output.txt");q.stdout.pipe(m),q.stdout.on("end",()=>j.end()),q.stderr.on("data",(k)=>{if(j.write(k),F.stderr)process.stderr.write(k)});let D=new l,J=w?Un(async(k)=>{let W=Vh(k,s,R);try{if(i)await o.updateReviewZone(u,"plan",W);else await o.updateZone(u,"plan",W);console.log(`[ticker] updated plan section (${k.length} todos)`)}catch(En){console.error("[ticker] PATCH failed:",En)}},Kh):null;if(J)D.addFlusher(J.flush);else console.log("[ticker] no cooking comment; plan mirroring disabled (direct mode)");if(D.on("TodoWrite",(k)=>{let W=k.data?.todos;if(!Array.isArray(W))return;if(zh(W),J)J.call(W)}),N)D.onMessage((k)=>{if(Fn(k)){console.log(k.type==="compaction_started"?"[agent] context compaction started (summarising older turns)\u2026":"[agent] context compaction completed");return}let W=k;if(W.role==="user"&&W.hidden===!0&&W.kind==="system_reminder")console.log("[agent] system reminder injected")});await D.observe(an(m)),await D.flush();let O=await Th(q),U=Date.now()-Ln;if(console.log(""),console.log("=========================================="),console.log(`Agent exited with code ${O}`),console.log(`Duration: ${zn(U)}`),console.log("=========================================="),t){if(K("run-duration-ms",String(U)),await Uh(j),F.stdout)Qn(40,f.redact);return console.error("[runner] cancelled mid-run; the salvage step will recover any work and report the timeout"),130}return K("exit-code",String(O)),K("run-duration-ms",String(U)),K("result",O===0?"Agent completed successfully":`Agent failed with exit code ${O}`),O}function Jh(n,h){return{...n,INFER_PROMPTS_AGENT_SYSTEM_PROMPT:h.systemPrompt,INFER_AGENT_SYSTEM_PROMPT_WITH_DEFAULTS:"true",INFER_TOOLS_BASH_ALLOW_APPEND:h.bashAllowAppend,INFER_REMINDERS_CONFIG:h.remindersYaml}}function Xh(n,h){try{let f=$h(n,["debug","agent","system_prompt"],{env:h,encoding:"utf8",timeout:30000});if(f.status!==0||!f.stdout?.trim())return;return f.stdout}catch{return}}function Zh(n,h){if(h)return n;let f=n.indexOf("PERSISTENT MEMORY INDEX");if(f===-1)return n;let o=n.slice(f),a=o.indexOf(`

Current date:`),u=a===-1?"":o.slice(a);return`${n.slice(0,f)}PERSISTENT MEMORY INDEX: [redacted - set debug: true to include memory entries]${u}`}function Qh(n,h){let f=[`**Model:** \`${h}\``];if(n)f.push(`[View Job](${n})`);return`${fn}

${f.join(" \xB7 ")}`}function Vh(n,h,f){let o=Qh(h,f);if(n.length===0)return`${o}

### Todos

_(agent has not posted a plan yet)_`;let a=n.map((u)=>{return`- ${u.status==="completed"?"[x]":u.status==="in_progress"?"[~]":"[ ]"} ${u.content}`});return[o,"","### Todos","",...a].join(`
`)}function Gh(n){let h=n.stderr;return((typeof h==="string"?h:"")+String(n.message)).includes("couldn't find remote ref")}function Fh(n,h=_){try{if(n.isFork){let f=`pr-${n.prNumber}`;console.log(`[runner] fork PR; fetching pull/${n.prNumber}/head into ${f}`),h(`git fetch origin pull/${n.prNumber}/head:${f}`),h(`git checkout ${f}`)}else{console.log(`[runner] checking out PR head branch ${n.headRef}`);try{h(`git fetch origin ${n.headRef}`)}catch(f){if(!Gh(f))throw f;process.stdout.write(`::warning::PR head branch ${n.headRef} no longer exists on origin (likely deleted when the PR was closed or merged); recreating it from pull/${n.prNumber}/head. If the PR is closed or merged, pushing will not reopen it.
`),h(`git fetch origin pull/${n.prNumber}/head:${n.headRef}`)}h(`git checkout ${n.headRef}`)}}catch(f){throw Error(`Failed to check out PR head (${n.headRef}). Aborting before spawning the agent so it doesn't run against the wrong branch.`,{cause:f})}}async function Th(n){if(n.exitCode!==null)return n.exitCode;return new Promise((h)=>{n.on("close",(f)=>h(f??0))})}async function Uh(n){if(n.writableFinished)return;await Promise.race([new Promise((h)=>n.once("finish",h)),new Promise((h)=>setTimeout(h,2000).unref())])}function zh(n){try{Pn(B,JSON.stringify(n))}catch(h){console.error("[runner] failed to persist todos:",h)}}function Ph(){try{Pn(B,"[]")}catch{}}if(import.meta.main)jh().then((n)=>process.exit(n),(n)=>{console.error("[runner] uncaught error:",n),process.exit(1)});export{Xh as resolveMergedSystemPrompt,Vh as renderPlan,Zh as redactMemoryIndex,Fh as ensurePrHeadCheckedOut,Jh as buildChildEnv};
