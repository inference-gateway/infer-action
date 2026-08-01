#!/usr/bin/env bun
// @bun
import{spawn as $h,spawnSync as Hh}from"child_process";import{createWriteStream as Kh,writeFileSync as zn}from"fs";import{PassThrough as jh}from"stream";var Bn=["git add( .*)?","git commit( .*)?","git push( .*)?","git checkout( .*)?","git switch( .*)?","git fetch( .*)?","git restore( .*)?","git reset( .*)?","git stash( .*)?","gh pr create( .*)?","gh pr ready( .*)?","gh pr edit( [0-9]+)? --(title|body|body-file)( .*)?"];function p(n,h){return[...n?Bn:[],h.trim()].filter(Boolean).join(",")}class T{token;baseUrl;fetchImpl;constructor(n){this.token=n.token,this.baseUrl=(n.baseUrl||process.env.GITHUB_API_URL||"https://api.github.com").replace(/\/+$/,""),this.fetchImpl=n.fetchImpl??fetch}issues={getComment:(n)=>this.request("GET",`/repos/${n.owner}/${n.repo}/issues/comments/${n.comment_id}`),updateComment:(n)=>this.request("PATCH",`/repos/${n.owner}/${n.repo}/issues/comments/${n.comment_id}`,void 0,{body:n.body}),createComment:(n)=>this.request("POST",`/repos/${n.owner}/${n.repo}/issues/${n.issue_number}/comments`,void 0,{body:n.body}),listComments:(n)=>this.request("GET",`/repos/${n.owner}/${n.repo}/issues/${n.issue_number}/comments`,{per_page:n.per_page,page:n.page}),listEventsForTimeline:(n)=>this.request("GET",`/repos/${n.owner}/${n.repo}/issues/${n.issue_number}/timeline`,{per_page:n.per_page})};pulls={list:(n)=>this.request("GET",`/repos/${n.owner}/${n.repo}/pulls`,{head:n.head,state:n.state,per_page:n.per_page}),get:(n)=>this.request("GET",`/repos/${n.owner}/${n.repo}/pulls/${n.pull_number}`),create:(n)=>this.request("POST",`/repos/${n.owner}/${n.repo}/pulls`,void 0,{head:n.head,base:n.base,title:n.title,body:n.body,draft:n.draft}),listComments:(n)=>this.request("GET",`/repos/${n.owner}/${n.repo}/pulls/${n.pull_number}/comments`,{per_page:n.per_page,page:n.page}),update:(n)=>this.request("PATCH",`/repos/${n.owner}/${n.repo}/pulls/${n.pull_number}`,void 0,{body:n.body}),getComment:(n)=>this.request("GET",`/repos/${n.owner}/${n.repo}/pulls/comments/${n.comment_id}`),updateComment:(n)=>this.request("PATCH",`/repos/${n.owner}/${n.repo}/pulls/comments/${n.comment_id}`,void 0,{body:n.body})};repos={get:(n)=>this.request("GET",`/repos/${n.owner}/${n.repo}`),createOrUpdateFileContents:(n)=>this.request("PUT",`/repos/${n.owner}/${n.repo}/contents/${n.path}`,void 0,{message:n.message,content:n.content,branch:n.branch})};git={getRef:(n)=>this.request("GET",`/repos/${n.owner}/${n.repo}/git/ref/${n.ref}`),createRef:(n)=>this.request("POST",`/repos/${n.owner}/${n.repo}/git/refs`,void 0,{ref:n.ref,sha:n.sha})};async request(n,h,o,f){let a=`${this.baseUrl}${h}`;if(o){let u=new URLSearchParams;for(let[w,R]of Object.entries(o))u.set(w,String(R));a+=`?${u.toString()}`}let i={Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","User-Agent":"infer-action"};if(this.token)i.Authorization=`Bearer ${this.token}`;if(f!==void 0)i["Content-Type"]="application/json";let s=await this.fetchImpl(a,{method:n,headers:i,...f!==void 0?{body:JSON.stringify(f)}:{}});if(!s.ok){let u=await s.text().catch(()=>"");throw Error(`GitHub API ${n} ${h} -> ${s.status} ${s.statusText}: ${u.slice(0,300)}`)}if(s.status===204)return{data:void 0};return{data:await s.json()}}}var X="<!-- infer:plan-end -->",Z="<!-- infer:result-start -->",H="infer-artifacts",nn="<!-- infer:spinner -->",F="<!-- /infer:spinner -->",hn=`${nn}<img src="https://raw.githubusercontent.com/inference-gateway/infer-action/main/assets/spinner.svg" width="22" height="22" alt="Working" />${F}`;function tn(n){let h=n.indexOf(nn);if(h===-1)return n;let o=n.indexOf(F,h);if(o===-1)return n;let f=o+F.length;while(f<n.length&&(n[f]===`
`||n[f]==="\r"))f++;return n.slice(0,h)+n.slice(f)}function ln(n){let h=n.indexOf(X),o=n.indexOf(Z);if(h===-1&&o===-1)return{plan:n,middle:"",result:""};if(h===-1)return{plan:n.slice(0,o),middle:"",result:n.slice(o+Z.length)};if(o===-1)return{plan:n.slice(0,h),middle:n.slice(h+X.length),result:""};return{plan:n.slice(0,h),middle:n.slice(h+X.length,o),result:n.slice(o+Z.length)}}function An(n){let h=n.plan.trim(),o=n.middle.trim(),f=n.result.trim();if(!o&&!f)return h;let a=h;if(a+=`

${X}`,o)a+=`

${o}`;if(a+=`

${Z}`,f)a+=`

${f}`;return a}class U{api;redactor;dryRun;reviewComment;owner;repoName;constructor(n){this.api=n.api??new T({token:n.token}),this.redactor=n.redactor,this.dryRun=n.dryRun??!1,this.reviewComment=n.reviewComment??!1;let[h,o]=n.repo.split("/");if(!h||!o)throw Error(`Invalid repo string "${n.repo}", expected "owner/name"`);this.owner=h,this.repoName=o}commentUrl(n){return`https://github.com/${this.owner}/${this.repoName}/issues/comments/${n}`}issueUrl(n){return`https://github.com/${this.owner}/${this.repoName}/issues/${n}`}prUrl(n){return`https://github.com/${this.owner}/${this.repoName}/pull/${n}`}async getCommentBody(n){return(await(this.reviewComment?this.api.pulls:this.api.issues).getComment({owner:this.owner,repo:this.repoName,comment_id:n})).data.body??""}async updateCommentBody(n,h){let o=this.redactor?this.redactor.redact(h):h;if(this.dryRun){console.log(`[dry-run] would update comment #${n} (${this.commentUrl(n)}):
${o}`);return}await(this.reviewComment?this.api.pulls:this.api.issues).updateComment({owner:this.owner,repo:this.repoName,comment_id:n,body:o})}async createIssueComment(n,h){let o=this.redactor?this.redactor.redact(h):h;if(this.dryRun){console.log(`[dry-run] would create a github issue comment on issue #${n} (${this.issueUrl(n)}):
${o}`);return}await this.api.issues.createComment({owner:this.owner,repo:this.repoName,issue_number:n,body:o})}async updateZone(n,h,o){if(this.dryRun){let i=this.redactor?this.redactor.redact(o):o;console.log(`[dry-run] would update the ${h} zone of comment #${n} (${this.commentUrl(n)}):
${i}`);return}let f=await this.getCommentBody(n),a=ln(f);a[h]=o,await this.updateCommentBody(n,An(a))}async clearSpinner(n){if(this.dryRun){console.log(`[dry-run] would clear the spinner on comment #${n} (${this.commentUrl(n)})`);return}let h=await this.getCommentBody(n),o=tn(h);if(o===h)return;await this.updateCommentBody(n,o)}async getOpenPrForBranch(n){let o=(await this.api.pulls.list({owner:this.owner,repo:this.repoName,head:`${this.owner}:${n}`,state:"open",per_page:1})).data[0];if(!o)return null;return{number:o.number,url:o.html_url,body:o.body??"",baseRef:o.base.ref}}async getPrForBranch(n){let h=await this.api.pulls.list({owner:this.owner,repo:this.repoName,head:`${this.owner}:${n}`,state:"all",per_page:20}),o=(s)=>({number:s.number,url:s.html_url,body:s.body??"",baseRef:s.base.ref,state:s.state==="open"?"open":"closed",merged:s.merged_at!=null}),f=h.data.find((s)=>s.state==="open");if(f)return o(f);let a=h.data.find((s)=>s.merged_at!=null);if(a)return o(a);let i=h.data[0];return i?o(i):null}async findPrsReferencingIssue(n){let o=(await this.api.issues.listEventsForTimeline({owner:this.owner,repo:this.repoName,issue_number:n,per_page:100})).data,f=new Map;for(let a of o){if(a.event!=="cross-referenced")continue;let i=a.source?.issue;if(!i||!i.pull_request||typeof i.number!=="number")continue;f.set(i.number,{number:i.number,url:i.html_url??"",state:i.state??"",headRef:"",baseRef:"",isDraft:i.draft??!1,title:i.title??""})}return[...f.values()]}async updatePullRequestBody(n,h){let o=this.redactor?this.redactor.redact(h):h;if(this.dryRun){console.log(`[dry-run] would update PR #${n} body (${this.prUrl(n)}):
${o}`);return}await this.api.pulls.update({owner:this.owner,repo:this.repoName,pull_number:n,body:o})}async createDraftPr(n){let h=this.redactor?this.redactor.redact(n.body):n.body;if(this.dryRun)return console.log(`[dry-run] would open a DRAFT PR ${n.head} -> ${n.base} titled "${n.title}":
${h}`),{number:0,url:"(dry-run)",body:h,baseRef:n.base};let o=await this.api.pulls.create({owner:this.owner,repo:this.repoName,head:n.head,base:n.base,title:n.title,body:h,draft:!0});return{number:o.data.number,url:o.data.html_url,body:o.data.body??"",baseRef:o.data.base.ref}}async uploadArtifactImage(n,h,o){let f=`${n}/${h}`,a=`https://raw.githubusercontent.com/${this.owner}/${this.repoName}/${H}/${n}/${encodeURIComponent(h)}`;if(this.dryRun)return console.log(`[dry-run] would upload artifact image ${h} to branch ${H} at ${f}`),a;try{return await this.ensureArtifactsBranch(),(await this.api.repos.createOrUpdateFileContents({owner:this.owner,repo:this.repoName,path:f,message:`chore: add run artifact ${h} (run ${n})`,content:Buffer.from(o).toString("base64"),branch:H})).data.content?.download_url||a}catch(i){return console.error(`artifact image upload failed for ${h}:`,i),null}}async ensureArtifactsBranch(){try{await this.api.git.getRef({owner:this.owner,repo:this.repoName,ref:`heads/${H}`});return}catch{}let n=await this.getDefaultBranch(),h=await this.api.git.getRef({owner:this.owner,repo:this.repoName,ref:`heads/${n}`});await this.api.git.createRef({owner:this.owner,repo:this.repoName,ref:`refs/heads/${H}`,sha:h.data.object.sha})}async getDefaultBranch(){return(await this.api.repos.get({owner:this.owner,repo:this.repoName})).data.default_branch}async getPullRequest(n){let h=await this.api.pulls.get({owner:this.owner,repo:this.repoName,pull_number:n});return{title:h.data.title,body:h.data.body??"",headRef:h.data.head.ref,headRepoFullName:h.data.head.repo?.full_name??"",baseRef:h.data.base.ref,state:h.data.merged_at?"merged":h.data.state==="open"?"open":"closed"}}async listIssueComments(n){let h=[],o=2;for(let f=1;f<=2;f++){let a=await this.api.issues.listComments({owner:this.owner,repo:this.repoName,issue_number:n,per_page:100,page:f});for(let i of a.data)h.push({id:i.id,author:i.user?.login??"unknown",body:i.body??"",createdAt:i.created_at});if(a.data.length<100)break}return h}async listReviewComments(n){let h=[],o=2;for(let f=1;f<=2;f++){let a=await this.api.pulls.listComments({owner:this.owner,repo:this.repoName,pull_number:n,per_page:100,page:f});for(let i of a.data)h.push({id:i.id,author:i.user?.login??"unknown",body:i.body??"",createdAt:i.created_at,inReplyToId:i.in_reply_to_id??0});if(a.data.length<100)break}return h}}function on(n){return{stdout:n.INFER_MIRROR_AGENT_LOGS==="true",stderr:!0}}import _n from"readline";async function*fn(n){let h=_n.createInterface({input:n,crlfDelay:1/0});for await(let o of h){let f=o.trim();if(!f)continue;if(f[0]!=="{")continue;try{let a=JSON.parse(f);if(typeof a!=="object"||a===null)continue;let{role:i,type:s}=a;if(typeof i==="string"||s==="session_stats"||s==="compaction_started"||s==="compaction_completed")yield a}catch{}}}async function an(n,h){let o=n.INFER_CONTEXT_KIND;if(!o)throw Error("Missing required env var INFER_CONTEXT_KIND");if(o==="issue")return In(n,h);if(o==="pull_request")return gn(n,h);if(o==="direct")return Nn(n);throw Error(`Unknown INFER_CONTEXT_KIND "${o}" (expected "issue", "pull_request", or "direct")`)}function sn(n){let h=n.INFER_CONTEXT_KIND;if(h==="direct")return{kind:"direct",prompt:(n.INFER_DIRECT_PROMPT??"").trim()||"(dry-run: no prompt)"};if(h==="pull_request"){let o=un(n),f=o?M(n):void 0;return{kind:"pull_request",prNumber:Number.parseInt(n.INFER_ISSUE_NUMBER??"0",10)||0,prTitle:"(dry-run: PR title unavailable)",prBody:"",headRef:"(unknown)",baseRef:"main",headRepoFullName:"",isFork:!1,prState:"open",triggeringCommentId:f?.id??0,comments:f?[{id:f.id,author:f.author,body:f.body,createdAt:"",isTrigger:!0}]:[],...o?{reviewComment:o}:{}}}return{kind:"issue",issueNumber:Number.parseInt(n.INFER_ISSUE_NUMBER??"0",10)||0,issueTitle:n.INFER_ISSUE_TITLE??"",issueBody:n.INFER_ISSUE_BODY??""}}function Nn(n){let h=(n.INFER_DIRECT_PROMPT??"").trim();if(!h)throw Error("Missing or empty INFER_DIRECT_PROMPT for direct context");return{kind:"direct",prompt:h}}async function In(n,h){let o=Number.parseInt(n.INFER_ISSUE_NUMBER??"",10);if(!Number.isFinite(o))throw Error("Missing or invalid INFER_ISSUE_NUMBER");let f=n.INFER_ISSUE_TITLE??"",a=n.INFER_ISSUE_BODY??"",i=M(n),[{associatedPrs:s,associatedBranches:u},w]=await Promise.all([Sn(h,o),vn(h,o,i?.id??0)]);return{kind:"issue",issueNumber:o,issueTitle:f,issueBody:a,...i?{triggeringComment:i}:{},...s.length?{associatedPrs:s}:{},...u.length?{associatedBranches:u}:{},...w.length?{threadComments:w}:{}}}async function vn(n,h,o){try{return(await n.listIssueComments(h)).map((a)=>({id:a.id,author:a.author,body:a.body,createdAt:a.createdAt,isTrigger:o>0&&a.id===o}))}catch(f){return console.warn(`[context] failed to list comments for issue #${h}; proceeding without the thread:`,f instanceof Error?f.message:f),[]}}async function Sn(n,h){let o=`fix/issue-${h}`;try{let[f,a]=await Promise.all([n.getOpenPrForBranch(o),n.findPrsReferencingIssue(h)]),i=new Map;for(let w of a)i.set(w.number,w);if(f){let w=i.get(f.number);i.set(f.number,{number:f.number,url:w?.url||f.url,state:w?.state||"open",headRef:o,baseRef:f.baseRef,isDraft:w?.isDraft??!1,title:w?.title??""})}return{associatedPrs:[...i.values()],associatedBranches:f?[o]:[]}}catch(f){return console.warn(`[context] failed to gather existing work for issue #${h}; proceeding without it:`,f instanceof Error?f.message:f),{associatedPrs:[],associatedBranches:[]}}}async function gn(n,h){let o=Number.parseInt(n.INFER_ISSUE_NUMBER??"",10);if(!Number.isFinite(o))throw Error("Missing or invalid INFER_ISSUE_NUMBER for PR context");let f=Number.parseInt(n.INFER_TRIGGERING_COMMENT_ID??"",10),a=Number.isFinite(f)?f:0,i=un(n),[s,u]=await Promise.all([h.getPullRequest(o),i?Cn(n,h,o,a):h.listIssueComments(o).then((q)=>q.map((O)=>({id:O.id,author:O.author,body:O.body,createdAt:O.createdAt,isTrigger:a>0&&O.id===a})))]),w=`${h.owner}/${h.repoName}`,R=s.headRepoFullName!==""&&s.headRepoFullName!==w;return{kind:"pull_request",prNumber:o,prTitle:s.title,prBody:s.body,headRef:s.headRef,baseRef:s.baseRef,headRepoFullName:s.headRepoFullName,isFork:R,prState:s.state,triggeringCommentId:a,comments:u,...i?{reviewComment:i}:{}}}function un(n){let h=(n.INFER_REVIEW_COMMENT_PATH??"").trim();if(!h)return;let o=Number.parseInt(n.INFER_REVIEW_COMMENT_LINE??"",10),f=Number.parseInt(n.INFER_REVIEW_COMMENT_START_LINE??"",10);return{path:h,diffHunk:n.INFER_REVIEW_COMMENT_DIFF_HUNK??"",...Number.isFinite(o)?{line:o}:{},...Number.isFinite(f)?{startLine:f}:{}}}async function Cn(n,h,o,f){let a=Number.parseInt(n.INFER_REVIEW_COMMENT_IN_REPLY_TO??"",10),i=[];if(Number.isFinite(a)&&a>0){let s=await h.listReviewComments(o);for(let u of s)if(u.id===a||u.inReplyToId===a)i.push({id:u.id,author:u.author,body:u.body,createdAt:u.createdAt,isTrigger:f>0&&u.id===f})}if(!i.some((s)=>s.isTrigger)){let s=M(n);if(s)i.push({id:s.id,author:s.author,body:s.body,createdAt:"",isTrigger:!0})}return i}function M(n){let h=n.INFER_TRIGGERING_COMMENT_ID??"",o=n.INFER_TRIGGERING_COMMENT_BODY??"",f=n.INFER_TRIGGERING_COMMENT_AUTHOR??"",a=Number.parseInt(h,10);if(!Number.isFinite(a)||a<=0)return;if(!o.trim())return;return{id:a,body:o,author:f}}var L=["GITHUB_TOKEN","OLLAMA_CLOUD_API_KEY","GROQ_API_KEY","LLAMACPP_API_KEY","OPENAI_API_KEY","CLOUDFLARE_API_KEY","COHERE_API_KEY","ANTHROPIC_API_KEY","DEEPSEEK_API_KEY","GOOGLE_API_KEY","MISTRAL_API_KEY","MINIMAX_API_KEY","MOONSHOT_API_KEY","NVIDIA_API_KEY","ZAI_API_KEY","OTEL_EXPORTER_OTLP_HEADERS","MEMORY_TOKEN","MEMORY_DEPLOY_KEY"],dn=["-----BEGIN [A-Z ]*PRIVATE KEY( BLOCK)?-----[\\s\\S]+?-----END [A-Z ]*PRIVATE KEY( BLOCK)?-----"],mn=["github_pat_[A-Za-z0-9_]{82,}","gh[pours]_[A-Za-z0-9]{36,}","AIza[0-9A-Za-z_-]{35}","xox[bpoa]-[A-Za-z0-9-]{20,}","sk-[A-Za-z0-9_-]{20,}","eyJ[A-Za-z0-9_-]+\\.eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]{10,}"];var bn=/[.*+?^${}()|[\]\\]/g;function E(n,h,o=8){let f=[],a=new Set;for(let i of h){let s=n[i];if(typeof s!=="string")continue;if(s.trim().length<o)continue;if(a.has(s))continue;a.add(s),f.push(s)}return f}function wn(n){let h=new Set;for(let o of n){if(!o||h.has(o))continue;h.add(o),process.stdout.write(`::add-mask::${o}
`)}}function en(n={}){let h=n.placeholder??"***",o=n.minLength??8,f=n.env??process.env,a=n.heuristics??!1,i=E(f,L,o);i.sort((w,R)=>R.length-w.length);let s=i.map(cn);if(s.push(...dn),a)s.push(...mn);let u=s.length>0?new RegExp(s.join("|"),"g"):null;return{secretCount:i.length,redact(w){if(!u||!w)return w;return w.replace(u,h)}}}function cn(n){return n.replace(bn,"\\$&")}var V="/tmp/agent-output.txt",B="/tmp/infer-todos.json",t="/tmp/infer-cancelled";function Q(n){let h=process.env[n];if(!h)throw Error(`Missing required env var ${n}`);return h}function y(n){return process.env[n]??""}function yn(){let n=y("INFER_DRY_RUN")==="true",h=n?y("GITHUB_TOKEN"):Q("GITHUB_TOKEN"),o=Q("INFER_REPO"),f=y("INFER_ENABLE_GIT_OPERATIONS")!=="false",a=y("INFER_REDACT_HEURISTICS")==="true",i=E(process.env,L);wn(i);let s=en({env:process.env,heuristics:a}),u=y("INFER_COOKING_COMMENT_IS_REVIEW")==="true",w=new U({token:h,repo:o,redactor:s,dryRun:n,reviewComment:u});return{dryRun:n,token:h,repo:o,enableGitOps:f,enableHeuristics:a,redactor:s,github:w}}async function kn(n,h,o){try{return await an(n,h)}catch(f){if(o.failHard)throw f;return console.warn(`[${o.stepName}] context read failed (${f.message}); proceeding with env-derived data`),sn(n)}}var Rn={SYSTEM_DIRECT:`# Infer Agent (manual run)

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

Your final message is the ONLY thing posted to the workflow job summary -
nothing you write before it is ever shown, so never defer to an earlier
message. If you changed code, end with a short summary; if you were asked
to analyze or report, put the COMPLETE output in this final message. Do
not call any GitHub APIs to report.

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

Your final message is the ONLY thing posted to the issue - nothing you
write before it is ever shown to anyone, so never defer to an earlier
message. If you changed code, end with a short summary of what you changed.
If you only answered a question, put the COMPLETE answer in this final
message. Do not call any GitHub comment APIs - the runner posts your
result.

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

Your final message is the ONLY thing posted to the PR - nothing you write
before it is ever shown to anyone, so never defer to an earlier message.
Put the COMPLETE findings or answer in this final message. Do not call any
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

A request to REVIEW the PR - review, feedback, assessment, opinion,
"look at this" - is also NOT a code-change task. Do NOT edit files,
commit, or push. Read the diff (\`git diff origin/{{baseRef}}...HEAD\`)
and the changed files, then report your findings and proposals in your
final message - the runner posts it as a comment. Only change code when
the comment explicitly asks you to change something.

When the run is triggered with an explicit review request the Edit, Write,
and Delete tools are disabled - do not attempt them, they will fail. Read
and report; put every proposed change as a description or a fenced diff in
your final message, not as a file edit.

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

Your final message is the ONLY thing posted to the PR - nothing you write
before it is ever shown to anyone, so never defer to an earlier message
("see above", "reported in my previous message"). If you changed code,
end with a short summary of what you changed. If you reviewed the PR or
answered a question, put the COMPLETE findings or answer in this final
message. Do not call any GitHub comment APIs - the runner posts your
result.

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

Run \`git diff origin/{{baseRef}}...HEAD\` for the full diff and \`git log origin/{{baseRef}}..HEAD\` for the commit history.{{triggerSection}}`};function xn(n){let h=process.env[`INFER_PROMPT_OVERRIDE_${n}`];return h&&h.trim()?h:Rn[n]}function pn(n){let h=process.env[`INFER_PROMPT_OVERRIDE_${n}`];return h&&h.trim()?h:null}var nh={SYSTEM_ISSUE:["git commit","git push","gh pr create","gh pr ready","git status"],SYSTEM_DIRECT:["git commit","git push","gh pr create","gh pr ready","git status"],SYSTEM_PR:["git commit","git push","git status"],SYSTEM_PR_FORK:["git commit","git push"]};function hh(n){if(n.kind==="issue")return"SYSTEM_ISSUE";if(n.kind==="direct")return"SYSTEM_DIRECT";if(n.isFork)return"SYSTEM_PR_FORK";return"SYSTEM_PR"}function Wn(n){let h=hh(n),o=pn(h);if(o===null)return[];let f=nh[h];if(!f||f.length===0)return[];let a=f.filter((i)=>!o.includes(i));return a.length>0?[{key:h,missing:a}]:[]}function r(n,h={}){return xn(n).replace(/\{\{(\w+)\}\}/g,(o,f)=>{if(!(f in h))throw Error(`Missing variable "${f}" for prompt "${n}"`);return String(h[f])})}function Yn(n,h={}){if(n.kind==="issue")return ah(n);if(n.kind==="direct")return fh(n);return sh(n,h.diffStat??"")}function rn(n,h){let o=oh(n);if(h.trim())return`${o}

## Additional Instructions

${h}`;return o}function oh(n){if(n.kind==="issue")return r("SYSTEM_ISSUE",{issueNumber:n.issueNumber});if(n.kind==="direct")return r("SYSTEM_DIRECT");if(n.isFork)return r("SYSTEM_PR_FORK",{prNumber:n.prNumber,headRef:n.headRef,headRepoFullName:n.headRepoFullName,baseRef:n.baseRef});return r("SYSTEM_PR",{prNumber:n.prNumber,headRef:n.headRef,baseRef:n.baseRef})}function fh(n){return r("TASK_DIRECT",{prompt:n.prompt})}function ah(n){let h=n.triggeringComment?`

## Triggering comment from @${n.triggeringComment.author}

${n.triggeringComment.body}

Treat this comment as the user's most recent intent. If it asks for something more specific than the issue body, prioritise it.`:"";return r("TASK_ISSUE",{issueNumber:n.issueNumber,issueTitle:n.issueTitle,issueBody:n.issueBody,existingWorkSection:ih(n),recentCommentsSection:On((n.threadComments??[]).filter((o)=>!o.isTrigger),"Recent comments (chronological)"),triggeringCommentSection:h})}function On(n,h){let o=n.filter((s)=>!s.author.endsWith("[bot]")),f=o.slice(-3);if(f.length===0)return"";let a=o.length-f.length,i=a>0?`_\u2026${a} earlier comment${a===1?"":"s"} omitted_

`:"";return`

## ${h}

${i}${f.map(qn).join(`

`)}`}function ih(n){let h=n.associatedPrs??[],o=n.associatedBranches??[];if(h.length===0&&o.length===0)return"";let f=["## Existing work for this issue","A prior run or another contributor may already have started on this issue. Before creating a branch, inspect the items below and CONTINUE from them if they contain relevant work - check it out (`gh pr checkout <number>`, or `git fetch origin <branch> && git checkout <branch>`) and build on top of it rather than starting fresh. Only start a new branch if none of these apply."];if(h.length){let a=h.map((i)=>{let s=i.isDraft?" (draft)":"",u=i.state&&i.state!=="open"?` [${i.state}]`:"",w=i.headRef?` - branch \`${i.headRef}\``:"",R=i.title?` - ${i.title}`:"";return`- PR #${i.number}${s}${u}${w}: ${i.url}${R}`});f.push(`### Pull requests

`+a.join(`
`))}if(o.length)f.push(`### Branches

`+o.map((a)=>`- \`${a}\``).join(`
`));return`

`+f.join(`

`)}function sh(n,h){let o=n.isFork?`
Head lives in a fork: ${n.headRepoFullName}. You CANNOT push commits to it from this runner.`:"";if(n.prState!=="open")o+=`
This PR is already ${n.prState}. Its head branch may have been deleted, and the checkout is likely on the default branch. Treat the request as follow-up work: if it needs no code changes (e.g. filing a follow-up issue), just do that; if it needs code changes, create a NEW branch off ${n.baseRef} and open a new PR - never push to the old head branch.`;let f=n.comments.find((R)=>R.isTrigger),a=f?`

## Triggering comment from @${f.author} (id: ${f.id})

${f.body}

This is the user's most recent ask. Address it directly. Do not re-implement existing changes unless this comment asks for that.`:"",i=n.comments.filter((R)=>!R.isTrigger);if(n.reviewComment)return uh(n,n.reviewComment,{forkNotice:o,triggerSection:a,others:i});let s=On(i,"Other comments (chronological)"),u=n.prBody.trim()?n.prBody:"_(no description)_",w=h.trim()?"```\n"+h.trim()+"\n```":"_(no changes on this branch yet)_";return r("TASK_PR",{prNumber:n.prNumber,prTitle:n.prTitle,headRef:n.headRef,baseRef:n.baseRef,forkNotice:o,prBody:u,triggerSection:a,otherCommentsSection:s,diffStatSection:w})}function uh(n,h,o){let f=h.startLine&&h.line&&h.startLine!==h.line?`, lines ${h.startLine}-${h.line}`:h.line?`, line ${h.line}`:"",a=o.others.length>0?`

## Earlier comments in this review thread

${o.others.map(qn).join(`

`)}`:"";return r("TASK_PR_REVIEW",{prNumber:n.prNumber,prTitle:n.prTitle,headRef:n.headRef,baseRef:n.baseRef,forkNotice:o.forkNotice,filePath:h.path,lineInfo:f,diffHunk:h.diffHunk,threadSection:a,triggerSection:o.triggerSection})}function qn(n){return`**@${n.author}** \xB7 ${n.createdAt}

${n.body}`}function wh(n,h){let o=[],f=h.enableGitOps&&!(n.kind==="pull_request"&&n.isFork);if(o.push({name:"infer-action-context",hook:"pre_stream",trigger:"interval",interval:5,text:h.enableGitOps?eh(n):"<system-reminder>Keep your TodoWrite plan current as you go. Only answering a question? Ignore this.</system-reminder>"}),f)o.push({name:"infer-action-wrap-up",hook:"pre_stream",trigger:"turns_before_max",threshold:10,text:yh(n)}),o.push({name:"infer-action-failed-tool",hook:"post_tool",trigger:"on_failure",text:kh()});return o}function eh(n){if(n.kind==="pull_request"&&n.isFork)return"<system-reminder>This PR is from a fork - you CANNOT commit or push. Investigate with file reads and git diff, then answer the user's question or summarise. Keep your TodoWrite plan current.</system-reminder>";if(n.kind==="pull_request")return`<system-reminder>Keep your TodoWrite plan current. If you changed files, commit + push after each step so PR #${n.prNumber} stays current - unpushed work is lost when the job ends. Only reviewing or answering? Do not change, commit, or push anything.</system-reminder>`;return"<system-reminder>Keep your TodoWrite plan current. Changing code? Work on a pushed branch with an open draft PR (`gh pr create --draft`) and commit + push after each step so nothing is lost - never commit on or push to main. Only answering a question? Ignore this.</system-reminder>"}function yh(n){return`<system-reminder>You are close to the turn limit. Stop starting new work - if you have uncommitted or unpushed changes, commit and push them now ${n.kind==="pull_request"?`so PR #${n.prNumber} is up to date`:"and make sure the draft PR exists (`gh pr create --draft`)"}. Unpushed work is lost when the run ends. If you changed nothing, just finish your summary.</system-reminder>`}function kh(){return"<system-reminder>That tool call FAILED - the change did NOT happen. Re-read or re-check, fix it, and retry. Never mark a todo done or claim success on a failed call.</system-reminder>"}function Rh(n){let h=["enabled: true","merge: true","reminders:"];for(let o of n){if(h.push(`  - name: ${JSON.stringify(o.name)}`),h.push(`    hook: ${JSON.stringify(o.hook)}`),h.push(`    trigger: ${JSON.stringify(o.trigger)}`),o.interval!==void 0)h.push(`    interval: ${o.interval}`);if(o.threshold!==void 0)h.push(`    threshold: ${o.threshold}`);h.push(`    text: ${JSON.stringify(o.text)}`)}return h.join(`
`)+`
`}function Dn(n,h,o){let f=n.trim();if(f)return f.endsWith(`
`)?f:f+`
`;return Rh(wh(h,o))}import{execFileSync as Wh}from"child_process";import{appendFileSync as $n,existsSync as ao,readFileSync as Yh,rmSync as rh,writeFileSync as Oh}from"fs";var qh=60000;function Hn(){try{Oh(t,"1")}catch(n){console.error("[runner] failed to write cancel marker:",n)}}function Kn(){try{rh(t,{force:!0})}catch{}}function jn(n,h=l){try{return h(`git diff --stat origin/${Dh(n)}...HEAD`)}catch(o){return console.error("[runner] git diff --stat failed:",o),""}}function Jn(n,h=(o)=>o){try{let a=Yh(V,"utf8").split(`
`).filter((i)=>i.trim()!=="").slice(-n);if(a.length===0)return;console.error("=========================================="),console.error(`[recover] last ${a.length} line(s) of agent activity before it stopped:`),console.error("------------------------------------------");for(let i of a){let s=i.length>2000?i.slice(0,2000)+" \u2026":i;console.error(h(s))}console.error("==========================================")}catch(o){console.error("[recover] could not read agent transcript for breadcrumb:",o)}}function l(n){return Wh("bash",["-c",n],{encoding:"utf8",timeout:qh,env:{...process.env,GIT_TERMINAL_PROMPT:"0"}})}function Dh(n){return`'${n.replace(/'/g,"'\\''")}'`}function K(n,h){let o=process.env.GITHUB_OUTPUT;if(!o){console.log(`(would set output) ${n}=${h}`);return}if(h.includes(`
`)){let f=`_GHO_EOF_${Math.random().toString(36).slice(2)}`;$n(o,`${n}<<${f}
${h}
${f}
`)}else $n(o,`${n}=${h}
`)}function Zn(n){return typeof n==="object"&&n!==null&&n.role==="tool"&&typeof n.content==="string"}function Qn(n){if(typeof n!=="object"||n===null)return!1;let h=n.type;return h==="compaction_started"||h==="compaction_completed"}var Xn="Result of tool call: ";function Vn(n){if(!n.startsWith(Xn))return null;let h=n.slice(Xn.length);try{let o=JSON.parse(h);if(typeof o==="object"&&o!==null)return o;return null}catch{return null}}class A{handlers=new Map;flushers=[];listeners=[];on(n,h){return this.handlers.set(n,h),this}onMessage(n){return this.listeners.push(n),this}addFlusher(n){return this.flushers.push(n),this}async observe(n){for await(let h of n){for(let a of this.listeners)try{a(h)}catch(i){console.error("[ticker] message listener threw:",i)}if(!Zn(h))continue;let o=Vn(h.content);if(!o?.tool_name)continue;let f=this.handlers.get(o.tool_name);if(!f)continue;try{await f(o,h)}catch(a){console.error(`[ticker] handler for ${o.tool_name} threw:`,a)}}}async flush(){for(let n of this.flushers)try{await n()}catch(h){console.error("[ticker] flusher threw:",h)}}}function Pn(n,h){let o=null,f=null,a=null,i=async()=>{if(f=null,!o)return;let s=o.value;o=null,a=n(s).catch((u)=>{console.error("[throttle] fn threw:",u)}).finally(()=>{a=null}),await a};return{call(s){if(o={value:s},!f)f=setTimeout(()=>{i()},h)},async flush(){if(f)clearTimeout(f),f=null;if(o)await i();else if(a)await a}}}function Gn(n){let h=Math.floor(n/1000);if(h<60)return`${h}s`;let o=Math.floor(h/60),f=h%60;if(o<60)return`${o}m ${f}s`;let a=Math.floor(o/60),i=o%60;return`${a}h ${i}m ${f}s`}var Jh=1500;async function Xh(){let{dryRun:n,enableGitOps:h,redactor:o,github:f}=yn(),a=y("INFER_REVIEW_MODE")==="true",i=h&&!a,s=y("INFER_COOKING_COMMENT_ID"),u=s?Number.parseInt(s,10):0,w=Number.isFinite(u)&&u>0,R=y("INFER_WORKFLOW_URL"),q=Q("INFER_AGENT_MODEL"),O=y("INFER_CUSTOM_INSTRUCTIONS"),Tn=y("INFER_BASH_ALLOW_APPEND"),_=y("INFER_LOGGING_DEBUG")==="true",P=on(process.env),W=await kn(process.env,f,{stepName:"dry-run",failHard:!n});if(W.kind==="pull_request"&&(h||a))try{Th(W)}catch(e){if(!n)throw e;console.warn("[dry-run] PR head checkout failed; continuing on the current branch:",e instanceof Error?e.message:e)}let Fn=W.kind==="pull_request"?jn(W.baseRef):"",N=rn(W,O),I=Yn(W,{diffStat:Fn});if(i)for(let e of Wn(W)){let k=e.key.replace(/^SYSTEM_/,"").toLowerCase().replace(/_/g,"-");process.stdout.write(`::warning::INFER_PROMPT_OVERRIDE_${e.key} replaces the bundled system prompt (system-prompt-${k} / src/prompts/system-${k}.md) and is missing the git-safety markers: ${e.missing.join(", ")}. The default guards against lost work (branch-first, commit-per-todo, push, draft PR, finish checklist); your override dropped those instructions, so the agent may leave changes uncommitted or unpushed. Re-add them to your override, or use the custom-instructions input to layer extras on top of the default instead of replacing it.
`)}let Un=y("INFER_REMINDERS_CONFIG"),v=Dn(Un,W,{enableGitOps:i}),S=p(i,Tn),G=y("INFER_BIN")||"infer",Mn=y("INFER_NO_COLOR")==="true",g=Zh(process.env,{systemPrompt:N,bashAllowAppend:S,remindersYaml:v,reviewMode:a});console.log("=========================================="),console.log("SYSTEM PROMPT:"),console.log("==========================================");let C=y("INFER_BIN")?void 0:Qh(G,g);if(console.log(C===void 0?N:Vh(C,_)),console.log("=========================================="),console.log(""),console.log("Running agent with task:"),console.log(I),console.log("---"),n)console.log("=========================================="),console.log("DRY RUN - the agent would be invoked with:"),console.log("=========================================="),console.log(`Model:        ${q}`),console.log(`Context kind: ${W.kind}`),console.log(`Git ops:      ${h?"enabled":"disabled"}`),console.log(`Review mode:  ${a?"enabled (Edit/Write/Delete disabled)":"disabled"}`),console.log(`INFER_BIN:    ${G}`),console.log("--- REMINDERS (INFER_REMINDERS_CONFIG) ---"),console.log(v),console.log("--- BASH ALLOW-LIST APPEND (added to the CLI read-only baseline) ---"),console.log(S||"(none - CLI read-only baseline only)"),console.log("==========================================");Lh(),Kn();let Ln=Date.now(),d=["agent","-m",q,I];if(Mn)d.push("--no-colors");let Y=$h(G,d,{stdio:["inherit","pipe","pipe"],env:g});if(!Y.stdout||!Y.stderr)throw Error("child stdio not piped - this should not happen");let m=!1,b=!1,c=(e)=>{if(b)return;b=!0,m=!0,Hn(),console.error(`[runner] received ${e}; stopping the agent so the salvage step can recover its work`);try{Y.kill("SIGKILL")}catch(k){console.error("[runner] failed to stop agent child:",k)}};process.once("SIGTERM",()=>c("SIGTERM")),process.once("SIGINT",()=>c("SIGINT"));let j=Kh(V),x=new jh;if(Y.stdout.pipe(j,{end:!1}),P.stdout)Y.stdout.pipe(process.stdout,{end:!1});else console.log("[runner] agent stdout muted (set INFER_MIRROR_AGENT_LOGS=true to mirror); stderr still shown, full transcript written to /tmp/agent-output.txt");Y.stdout.pipe(x),Y.stdout.on("end",()=>j.end()),Y.stderr.on("data",(e)=>{if(j.write(e),P.stderr)process.stderr.write(e)});let D=new A,J=w?Pn(async(e)=>{let k=Gh(e,R,q);try{await f.updateZone(u,"plan",k),console.log(`[ticker] updated plan section (${e.length} todos)`)}catch(En){console.error("[ticker] PATCH failed:",En)}},Jh):null;if(J)D.addFlusher(J.flush);else console.log("[ticker] no cooking comment; plan mirroring disabled (direct mode)");if(D.on("TodoWrite",(e)=>{let k=e.data?.todos;if(!Array.isArray(k))return;if(Mh(k),J)J.call(k)}),_)D.onMessage((e)=>{if(Qn(e)){console.log(e.type==="compaction_started"?"[agent] context compaction started (summarising older turns)\u2026":"[agent] context compaction completed");return}let k=e;if(k.role==="user"&&k.hidden===!0&&k.kind==="system_reminder")console.log("[agent] system reminder injected")});await D.observe(fn(x)),await D.flush();let $=await Fh(Y),z=Date.now()-Ln;if(console.log(""),console.log("=========================================="),console.log(`Agent exited with code ${$}`),console.log(`Duration: ${Gn(z)}`),console.log("=========================================="),m){if(K("run-duration-ms",String(z)),await Uh(j),P.stdout)Jn(40,o.redact);return console.error("[runner] cancelled mid-run; the salvage step will recover any work and report the timeout"),130}return K("exit-code",String($)),K("run-duration-ms",String(z)),K("result",$===0?"Agent completed successfully":`Agent failed with exit code ${$}`),$}function Zh(n,h){return{...n,INFER_PROMPTS_AGENT_SYSTEM_PROMPT:h.systemPrompt,INFER_AGENT_SYSTEM_PROMPT_WITH_DEFAULTS:"true",INFER_TOOLS_BASH_ALLOW_APPEND:h.bashAllowAppend,INFER_REMINDERS_CONFIG:h.remindersYaml,...h.reviewMode?{INFER_TOOLS_EDIT_ENABLED:"false",INFER_TOOLS_WRITE_ENABLED:"false",INFER_TOOLS_DELETE_ENABLED:"false"}:{},OTEL_EXPORTER_OTLP_ENDPOINT:n.OTEL_EXPORTER_OTLP_ENDPOINT??"",OTEL_EXPORTER_OTLP_HEADERS:n.OTEL_EXPORTER_OTLP_HEADERS??"",OTEL_SERVICE_NAME:n.OTEL_SERVICE_NAME??"infer-action",OTEL_RESOURCE_ATTRIBUTES:n.OTEL_RESOURCE_ATTRIBUTES??""}}function Qh(n,h){try{let o=Hh(n,["debug","agent","system_prompt"],{env:h,encoding:"utf8",timeout:30000});if(o.status!==0||!o.stdout?.trim())return;return o.stdout}catch{return}}function Vh(n,h){if(h)return n;let o=n.indexOf("PERSISTENT MEMORY INDEX");if(o===-1)return n;let f=n.slice(o),a=f.indexOf(`

Current date:`),i=a===-1?"":f.slice(a);return`${n.slice(0,o)}PERSISTENT MEMORY INDEX: [redacted - set debug: true to include memory entries]${i}`}function Ph(n,h){let o=[`**Model:** \`${h}\``];if(n)o.push(`[View Job](${n})`);return`${hn}

${o.join(" \xB7 ")}`}function Gh(n,h,o){let f=Ph(h,o);if(n.length===0)return`${f}

### Todos

_(agent has not posted a plan yet)_`;let a=n.map((i)=>{return`- ${i.status==="completed"?"[x]":i.status==="in_progress"?"[~]":"[ ]"} ${i.content}`});return[f,"","### Todos","",...a].join(`
`)}function zh(n){let h=n.stderr;return((typeof h==="string"?h:"")+String(n.message)).includes("couldn't find remote ref")}function Th(n,h=l){try{if(n.isFork){let o=`pr-${n.prNumber}`;console.log(`[runner] fork PR; fetching pull/${n.prNumber}/head into ${o}`),h(`git fetch origin pull/${n.prNumber}/head:${o}`),h(`git checkout ${o}`)}else{console.log(`[runner] checking out PR head branch ${n.headRef}`);try{h(`git fetch origin ${n.headRef}`)}catch(o){if(!zh(o))throw o;process.stdout.write(`::warning::PR head branch ${n.headRef} no longer exists on origin (likely deleted when the PR was closed or merged); recreating it from pull/${n.prNumber}/head. If the PR is closed or merged, pushing will not reopen it.
`),h(`git fetch origin pull/${n.prNumber}/head:${n.headRef}`)}h(`git checkout ${n.headRef}`)}}catch(o){throw Error(`Failed to check out PR head (${n.headRef}). Aborting before spawning the agent so it doesn't run against the wrong branch.`,{cause:o})}}async function Fh(n){if(n.exitCode!==null)return n.exitCode;return new Promise((h)=>{n.on("close",(o)=>h(o??0))})}async function Uh(n){if(n.writableFinished)return;await Promise.race([new Promise((h)=>n.once("finish",h)),new Promise((h)=>setTimeout(h,2000).unref())])}function Mh(n){try{zn(B,JSON.stringify(n))}catch(h){console.error("[runner] failed to persist todos:",h)}}function Lh(){try{zn(B,"[]")}catch{}}if(import.meta.main)Xh().then((n)=>process.exit(n),(n)=>{console.error("[runner] uncaught error:",n),process.exit(1)});export{Qh as resolveMergedSystemPrompt,Gh as renderPlan,Vh as redactMemoryIndex,Th as ensurePrHeadCheckedOut,Zh as buildChildEnv};
