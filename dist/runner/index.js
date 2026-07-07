#!/usr/bin/env bun
// @bun
import{spawn as kh,spawnSync as Rh}from"child_process";import{createWriteStream as Wh,writeFileSync as Zn}from"fs";import{PassThrough as Yh}from"stream";var Vn=["git add( .*)?","git commit( .*)?","git push( .*)?","git checkout( .*)?","git switch( .*)?","git fetch( .*)?","git restore( .*)?","git reset( .*)?","git stash( .*)?","gh pr create( .*)?","gh pr ready( .*)?","gh pr edit( [0-9]+)? --(title|body|body-file)( .*)?"];function b(n,h){return[...n?Vn:[],h.trim()].filter(Boolean).join(",")}class F{token;baseUrl;fetchImpl;constructor(n){this.token=n.token,this.baseUrl=(n.baseUrl||process.env.GITHUB_API_URL||"https://api.github.com").replace(/\/+$/,""),this.fetchImpl=n.fetchImpl??fetch}issues={getComment:(n)=>this.request("GET",`/repos/${n.owner}/${n.repo}/issues/comments/${n.comment_id}`),updateComment:(n)=>this.request("PATCH",`/repos/${n.owner}/${n.repo}/issues/comments/${n.comment_id}`,void 0,{body:n.body}),createComment:(n)=>this.request("POST",`/repos/${n.owner}/${n.repo}/issues/${n.issue_number}/comments`,void 0,{body:n.body}),listComments:(n)=>this.request("GET",`/repos/${n.owner}/${n.repo}/issues/${n.issue_number}/comments`,{per_page:n.per_page,page:n.page}),listEventsForTimeline:(n)=>this.request("GET",`/repos/${n.owner}/${n.repo}/issues/${n.issue_number}/timeline`,{per_page:n.per_page})};pulls={list:(n)=>this.request("GET",`/repos/${n.owner}/${n.repo}/pulls`,{head:n.head,state:n.state,per_page:n.per_page}),get:(n)=>this.request("GET",`/repos/${n.owner}/${n.repo}/pulls/${n.pull_number}`),create:(n)=>this.request("POST",`/repos/${n.owner}/${n.repo}/pulls`,void 0,{head:n.head,base:n.base,title:n.title,body:n.body,draft:n.draft}),listComments:(n)=>this.request("GET",`/repos/${n.owner}/${n.repo}/pulls/${n.pull_number}/comments`,{per_page:n.per_page,page:n.page}),update:(n)=>this.request("PATCH",`/repos/${n.owner}/${n.repo}/pulls/${n.pull_number}`,void 0,{body:n.body})};repos={get:(n)=>this.request("GET",`/repos/${n.owner}/${n.repo}`)};async request(n,h,o,a){let i=`${this.baseUrl}${h}`;if(o){let e=new URLSearchParams;for(let[u,t]of Object.entries(o))e.set(u,String(t));i+=`?${e.toString()}`}let f={Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","User-Agent":"infer-action"};if(this.token)f.Authorization=`Bearer ${this.token}`;if(a!==void 0)f["Content-Type"]="application/json";let s=await this.fetchImpl(i,{method:n,headers:f,...a!==void 0?{body:JSON.stringify(a)}:{}});if(!s.ok){let e=await s.text().catch(()=>"");throw Error(`GitHub API ${n} ${h} -> ${s.status} ${s.statusText}: ${e.slice(0,300)}`)}if(s.status===204)return{data:void 0};return{data:await s.json()}}}var O="<!-- infer:plan-end -->",K="<!-- infer:result-start -->",c="<!-- infer:spinner -->",G="<!-- /infer:spinner -->",p=`${c}<img src="https://raw.githubusercontent.com/inference-gateway/infer-action/main/assets/spinner.svg" width="22" height="22" alt="Working" />${G}`;function Pn(n){let h=n.indexOf(c);if(h===-1)return n;let o=n.indexOf(G,h);if(o===-1)return n;let a=o+G.length;while(a<n.length&&(n[a]===`
`||n[a]==="\r"))a++;return n.slice(0,h)+n.slice(a)}function zn(n){let h=n.indexOf(O),o=n.indexOf(K);if(h===-1&&o===-1)return{plan:n,middle:"",result:""};if(h===-1)return{plan:n.slice(0,o),middle:"",result:n.slice(o+K.length)};if(o===-1)return{plan:n.slice(0,h),middle:n.slice(h+O.length),result:""};return{plan:n.slice(0,h),middle:n.slice(h+O.length,o),result:n.slice(o+K.length)}}function Tn(n){let h=n.plan.trim(),o=n.middle.trim(),a=n.result.trim();if(!o&&!a)return h;let i=h;if(i+=`

${O}`,o)i+=`

${o}`;if(i+=`

${K}`,a)i+=`

${a}`;return i}class U{api;redactor;dryRun;owner;repoName;constructor(n){this.api=n.api??new F({token:n.token}),this.redactor=n.redactor,this.dryRun=n.dryRun??!1;let[h,o]=n.repo.split("/");if(!h||!o)throw Error(`Invalid repo string "${n.repo}", expected "owner/name"`);this.owner=h,this.repoName=o}commentUrl(n){return`https://github.com/${this.owner}/${this.repoName}/issues/comments/${n}`}issueUrl(n){return`https://github.com/${this.owner}/${this.repoName}/issues/${n}`}prUrl(n){return`https://github.com/${this.owner}/${this.repoName}/pull/${n}`}async getCommentBody(n){return(await this.api.issues.getComment({owner:this.owner,repo:this.repoName,comment_id:n})).data.body??""}async updateCommentBody(n,h){let o=this.redactor?this.redactor.redact(h):h;if(this.dryRun){console.log(`[dry-run] would update comment #${n} (${this.commentUrl(n)}):
${o}`);return}await this.api.issues.updateComment({owner:this.owner,repo:this.repoName,comment_id:n,body:o})}async createIssueComment(n,h){let o=this.redactor?this.redactor.redact(h):h;if(this.dryRun){console.log(`[dry-run] would create a github issue comment on issue #${n} (${this.issueUrl(n)}):
${o}`);return}await this.api.issues.createComment({owner:this.owner,repo:this.repoName,issue_number:n,body:o})}async updateZone(n,h,o){if(this.dryRun){let f=this.redactor?this.redactor.redact(o):o;console.log(`[dry-run] would update the ${h} zone of comment #${n} (${this.commentUrl(n)}):
${f}`);return}let a=await this.getCommentBody(n),i=zn(a);i[h]=o,await this.updateCommentBody(n,Tn(i))}async clearSpinner(n){if(this.dryRun){console.log(`[dry-run] would clear the spinner on comment #${n} (${this.commentUrl(n)})`);return}let h=await this.getCommentBody(n),o=Pn(h);if(o===h)return;await this.updateCommentBody(n,o)}async getOpenPrForBranch(n){let o=(await this.api.pulls.list({owner:this.owner,repo:this.repoName,head:`${this.owner}:${n}`,state:"open",per_page:1})).data[0];if(!o)return null;return{number:o.number,url:o.html_url,body:o.body??"",baseRef:o.base.ref}}async getPrForBranch(n){let h=await this.api.pulls.list({owner:this.owner,repo:this.repoName,head:`${this.owner}:${n}`,state:"all",per_page:20}),o=(s)=>({number:s.number,url:s.html_url,body:s.body??"",baseRef:s.base.ref,state:s.state==="open"?"open":"closed",merged:s.merged_at!=null}),a=h.data.find((s)=>s.state==="open");if(a)return o(a);let i=h.data.find((s)=>s.merged_at!=null);if(i)return o(i);let f=h.data[0];return f?o(f):null}async findPrsReferencingIssue(n){let o=(await this.api.issues.listEventsForTimeline({owner:this.owner,repo:this.repoName,issue_number:n,per_page:100})).data,a=new Map;for(let i of o){if(i.event!=="cross-referenced")continue;let f=i.source?.issue;if(!f||!f.pull_request||typeof f.number!=="number")continue;a.set(f.number,{number:f.number,url:f.html_url??"",state:f.state??"",headRef:"",baseRef:"",isDraft:f.draft??!1,title:f.title??""})}return[...a.values()]}async updatePullRequestBody(n,h){let o=this.redactor?this.redactor.redact(h):h;if(this.dryRun){console.log(`[dry-run] would update PR #${n} body (${this.prUrl(n)}):
${o}`);return}await this.api.pulls.update({owner:this.owner,repo:this.repoName,pull_number:n,body:o})}async createDraftPr(n){let h=this.redactor?this.redactor.redact(n.body):n.body;if(this.dryRun)return console.log(`[dry-run] would open a DRAFT PR ${n.head} -> ${n.base} titled "${n.title}":
${h}`),{number:0,url:"(dry-run)",body:h,baseRef:n.base};let o=await this.api.pulls.create({owner:this.owner,repo:this.repoName,head:n.head,base:n.base,title:n.title,body:h,draft:!0});return{number:o.data.number,url:o.data.html_url,body:o.data.body??"",baseRef:o.data.base.ref}}async getDefaultBranch(){return(await this.api.repos.get({owner:this.owner,repo:this.repoName})).data.default_branch}async getPullRequest(n){let h=await this.api.pulls.get({owner:this.owner,repo:this.repoName,pull_number:n});return{title:h.data.title,body:h.data.body??"",headRef:h.data.head.ref,headRepoFullName:h.data.head.repo?.full_name??"",baseRef:h.data.base.ref}}async listIssueComments(n){let h=[],o=2;for(let a=1;a<=2;a++){let i=await this.api.issues.listComments({owner:this.owner,repo:this.repoName,issue_number:n,per_page:100,page:a});for(let f of i.data)h.push({id:f.id,author:f.user?.login??"unknown",body:f.body??"",createdAt:f.created_at});if(i.data.length<100)break}return h}async listReviewComments(n){let h=[],o=2;for(let a=1;a<=2;a++){let i=await this.api.pulls.listComments({owner:this.owner,repo:this.repoName,pull_number:n,per_page:100,page:a});for(let f of i.data)h.push({id:f.id,author:f.user?.login??"unknown",body:f.body??"",createdAt:f.created_at,inReplyToId:f.in_reply_to_id??0});if(i.data.length<100)break}return h}}function x(n){return{stdout:n.INFER_MIRROR_AGENT_LOGS==="true",stderr:!0}}import Mn from"readline";async function*nn(n){let h=Mn.createInterface({input:n,crlfDelay:1/0});for await(let o of h){let a=o.trim();if(!a)continue;if(a[0]!=="{")continue;try{let i=JSON.parse(a);if(typeof i!=="object"||i===null)continue;let{role:f,type:s}=i;if(typeof f==="string"||s==="session_stats"||s==="compaction_started"||s==="compaction_completed")yield i}catch{}}}async function hn(n,h){let o=n.INFER_CONTEXT_KIND;if(!o)throw Error("Missing required env var INFER_CONTEXT_KIND");if(o==="issue")return Ln(n,h);if(o==="pull_request")return In(n,h);if(o==="direct")return An(n);throw Error(`Unknown INFER_CONTEXT_KIND "${o}" (expected "issue", "pull_request", or "direct")`)}function on(n){let h=n.INFER_CONTEXT_KIND;if(h==="direct")return{kind:"direct",prompt:(n.INFER_DIRECT_PROMPT??"").trim()||"(dry-run: no prompt)"};if(h==="pull_request"){let o=an(n),a=o?V(n):void 0;return{kind:"pull_request",prNumber:Number.parseInt(n.INFER_ISSUE_NUMBER??"0",10)||0,prTitle:"(dry-run: PR title unavailable)",prBody:"",headRef:"(unknown)",baseRef:"main",headRepoFullName:"",isFork:!1,triggeringCommentId:a?.id??0,comments:a?[{id:a.id,author:a.author,body:a.body,createdAt:"",isTrigger:!0}]:[],...o?{reviewComment:o}:{}}}return{kind:"issue",issueNumber:Number.parseInt(n.INFER_ISSUE_NUMBER??"0",10)||0,issueTitle:n.INFER_ISSUE_TITLE??"",issueBody:n.INFER_ISSUE_BODY??""}}function An(n){let h=(n.INFER_DIRECT_PROMPT??"").trim();if(!h)throw Error("Missing or empty INFER_DIRECT_PROMPT for direct context");return{kind:"direct",prompt:h}}async function Ln(n,h){let o=Number.parseInt(n.INFER_ISSUE_NUMBER??"",10);if(!Number.isFinite(o))throw Error("Missing or invalid INFER_ISSUE_NUMBER");let a=n.INFER_ISSUE_TITLE??"",i=n.INFER_ISSUE_BODY??"",f=V(n),[{associatedPrs:s,associatedBranches:e},u]=await Promise.all([En(h,o),Bn(h,o,f?.id??0)]);return{kind:"issue",issueNumber:o,issueTitle:a,issueBody:i,...f?{triggeringComment:f}:{},...s.length?{associatedPrs:s}:{},...e.length?{associatedBranches:e}:{},...u.length?{threadComments:u}:{}}}async function Bn(n,h,o){try{return(await n.listIssueComments(h)).map((i)=>({id:i.id,author:i.author,body:i.body,createdAt:i.createdAt,isTrigger:o>0&&i.id===o}))}catch(a){return console.warn(`[context] failed to list comments for issue #${h}; proceeding without the thread:`,a instanceof Error?a.message:a),[]}}async function En(n,h){let o=`fix/issue-${h}`;try{let[a,i]=await Promise.all([n.getOpenPrForBranch(o),n.findPrsReferencingIssue(h)]),f=new Map;for(let u of i)f.set(u.number,u);if(a){let u=f.get(a.number);f.set(a.number,{number:a.number,url:u?.url||a.url,state:u?.state||"open",headRef:o,baseRef:a.baseRef,isDraft:u?.isDraft??!1,title:u?.title??""})}return{associatedPrs:[...f.values()],associatedBranches:a?[o]:[]}}catch(a){return console.warn(`[context] failed to gather existing work for issue #${h}; proceeding without it:`,a instanceof Error?a.message:a),{associatedPrs:[],associatedBranches:[]}}}async function In(n,h){let o=Number.parseInt(n.INFER_ISSUE_NUMBER??"",10);if(!Number.isFinite(o))throw Error("Missing or invalid INFER_ISSUE_NUMBER for PR context");let a=Number.parseInt(n.INFER_TRIGGERING_COMMENT_ID??"",10),i=Number.isFinite(a)?a:0,f=an(n),[s,e]=await Promise.all([h.getPullRequest(o),f?_n(n,h,o,i):h.listIssueComments(o).then((X)=>X.map((R)=>({id:R.id,author:R.author,body:R.body,createdAt:R.createdAt,isTrigger:i>0&&R.id===i})))]),u=`${h.owner}/${h.repoName}`,t=s.headRepoFullName!==""&&s.headRepoFullName!==u;return{kind:"pull_request",prNumber:o,prTitle:s.title,prBody:s.body,headRef:s.headRef,baseRef:s.baseRef,headRepoFullName:s.headRepoFullName,isFork:t,triggeringCommentId:i,comments:e,...f?{reviewComment:f}:{}}}function an(n){let h=(n.INFER_REVIEW_COMMENT_PATH??"").trim();if(!h)return;let o=Number.parseInt(n.INFER_REVIEW_COMMENT_LINE??"",10),a=Number.parseInt(n.INFER_REVIEW_COMMENT_START_LINE??"",10);return{path:h,diffHunk:n.INFER_REVIEW_COMMENT_DIFF_HUNK??"",...Number.isFinite(o)?{line:o}:{},...Number.isFinite(a)?{startLine:a}:{}}}async function _n(n,h,o,a){let i=Number.parseInt(n.INFER_REVIEW_COMMENT_IN_REPLY_TO??"",10),f=[];if(Number.isFinite(i)&&i>0){let s=await h.listReviewComments(o);for(let e of s)if(e.id===i||e.inReplyToId===i)f.push({id:e.id,author:e.author,body:e.body,createdAt:e.createdAt,isTrigger:a>0&&e.id===a})}if(!f.some((s)=>s.isTrigger)){let s=V(n);if(s)f.push({id:s.id,author:s.author,body:s.body,createdAt:"",isTrigger:!0})}return f}function V(n){let h=n.INFER_TRIGGERING_COMMENT_ID??"",o=n.INFER_TRIGGERING_COMMENT_BODY??"",a=n.INFER_TRIGGERING_COMMENT_AUTHOR??"",i=Number.parseInt(h,10);if(!Number.isFinite(i)||i<=0)return;if(!o.trim())return;return{id:i,body:o,author:a}}var P=["GITHUB_TOKEN","OLLAMA_API_KEY","OLLAMA_CLOUD_API_KEY","GROQ_API_KEY","OPENAI_API_KEY","CLOUDFLARE_API_KEY","COHERE_API_KEY","ANTHROPIC_API_KEY","DEEPSEEK_API_KEY","GOOGLE_API_KEY","MISTRAL_API_KEY","MINIMAX_API_KEY","MOONSHOT_API_KEY","NVIDIA_API_KEY","CLAUDE_CODE_OAUTH_TOKEN","OTEL_EXPORTER_OTLP_HEADERS","MEMORY_TOKEN","MEMORY_DEPLOY_KEY"],Nn=["-----BEGIN [A-Z ]*PRIVATE KEY( BLOCK)?-----[\\s\\S]+?-----END [A-Z ]*PRIVATE KEY( BLOCK)?-----"],vn=["github_pat_[A-Za-z0-9_]{82,}","gh[pours]_[A-Za-z0-9]{36,}","AIza[0-9A-Za-z_-]{35}","xox[bpoa]-[A-Za-z0-9-]{20,}","sk-[A-Za-z0-9_-]{20,}","eyJ[A-Za-z0-9_-]+\\.eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]{10,}"];var Cn=/[.*+?^${}()|[\]\\]/g;function z(n,h,o=8){let a=[],i=new Set;for(let f of h){let s=n[f];if(typeof s!=="string")continue;if(s.trim().length<o)continue;if(i.has(s))continue;i.add(s),a.push(s)}return a}function fn(n){let h=new Set;for(let o of n){if(!o||h.has(o))continue;h.add(o),process.stdout.write(`::add-mask::${o}
`)}}function sn(n={}){let h=n.placeholder??"***",o=n.minLength??8,a=n.env??process.env,i=n.heuristics??!1,f=z(a,P,o);f.sort((u,t)=>t.length-u.length);let s=f.map(Sn);if(s.push(...Nn),i)s.push(...vn);let e=s.length>0?new RegExp(s.join("|"),"g"):null;return{secretCount:f.length,redact(u){if(!e||!u)return u;return u.replace(e,h)}}}function Sn(n){return n.replace(Cn,"\\$&")}var J="/tmp/agent-output.txt",T="/tmp/infer-todos.json",M="/tmp/infer-cancelled";function j(n){let h=process.env[n];if(!h)throw Error(`Missing required env var ${n}`);return h}function y(n){return process.env[n]??""}function en(){let n=y("INFER_DRY_RUN")==="true",h=n?y("GITHUB_TOKEN"):j("GITHUB_TOKEN"),o=j("INFER_REPO"),a=y("INFER_ENABLE_GIT_OPERATIONS")!=="false",i=y("INFER_REDACT_HEURISTICS")==="true",f=z(process.env,P);fn(f);let s=sn({env:process.env,heuristics:i}),e=new U({token:h,repo:o,redactor:s,dryRun:n});return{dryRun:n,token:h,repo:o,enableGitOps:a,enableHeuristics:i,redactor:s,github:e}}async function un(n,h,o){try{return await hn(n,h)}catch(a){if(o.failHard)throw a;return console.warn(`[${o.stepName}] context read failed (${a.message}); proceeding with env-derived data`),on(n)}}var wn={SYSTEM_DIRECT:`# Infer Agent (manual run)

You are running in CI from a manual dispatch. There is no GitHub issue or
pull request thread associated with this run - your task is the free-text
prompt below, and your result is captured in the workflow job summary.

The runner filesystem is ephemeral. Any change you do not commit and
push to a remote branch is lost when the job ends.

## Working style

Use TodoWrite to track your plan and update it as you make progress.
There is no issue/PR comment to mirror to; your progress is visible in the
job log and your final summary is posted to the job summary automatically.

If a tool call fails (an Edit that does not apply, a rejected command),
the change did NOT happen. Re-read the file, fix the call, and retry.
Never mark a todo completed - or claim success - based on a failed call.

To read a file in another repository, use \`gh api repos/<owner>/<repo>/contents/<path>\`,
\`gh repo view <owner>/<repo>\`, \`gh pr view\`, or \`gh issue view\` \u2014 tools that the CLI
already handles well. Reserve \`gh search code\` for when the file location is genuinely
unknown; note it is heavily rate-limited and should be used for at most one or two
queries.

When a CLI call fails and the error includes "unknown flag", the usage text printed
in the error message is the authoritative list of valid flags. Pick from those listed
flags instead of guessing another variant.

For questions or discussion (no code changes), just answer and stop -
skip the steps below. Your answer is your final output.

## Code changes

If you will make code changes, follow this order. Do NOT defer commits to
the end of the run.

NEVER commit on or push to \`main\`/\`master\` - branch protection rejects the
push and the work is stranded. All work happens on the working branch.

1. BEFORE any file edits, create and push a working branch off the default
   branch. Choose a short, descriptive kebab-case name:

       git checkout -B infer/<short-description>
       git push -u origin infer/<short-description>

   (for example \`infer/add-rate-limit-header\`). Do not call Edit/Write
   before this step succeeds - those edits will be lost. Before your first
   edit, confirm \`git branch --show-current\` does NOT report \`main\` or
   \`master\`.

2. AFTER each TodoWrite item you flip to "completed", validate then commit:

       <run the repo's checks and fix any failures>
       git add -A
       git commit -m "<type>(<scope>): <description>"
       git push origin infer/<short-description>

   Push your working branch by name - never \`main\`.

   Before committing, run the repository's own checks - lint, format,
   type-check, tests (e.g. \`npm run lint\`, \`npm test\`, \`task lint\` -
   whatever the repo provides) - and fix the failures. CI runs only AFTER
   this job ends, so you cannot fix it later. Do not batch commits. The job
   has a turn limit; if you defer commits, partial work is destroyed when
   the runner ends.

3. As soon as your FIRST commit is pushed, open the pull request as a DRAFT.
   Do this early - not at the end - so your work is preserved as a PR even if
   the run is cut off before you finish. Write the description to a file first
   with the Write tool (this avoids shell-quoting problems with multi-line
   text), then pass it with --body-file:

       <use the Write tool to write the PR description to /tmp/pr-body.md>

       gh pr create --draft \\
         --title "<type>(<scope>): <what changed>" \\
         --body-file /tmp/pr-body.md

   Write /tmp/pr-body.md from the actual diff. It must contain:

       ## Summary
       <2-4 sentences: what changed and why>

       ## Changes
       <bullet list of the notable changes>

   \`gh pr create\` targets the repository's default branch and takes the head
   from your current branch. A one-line body is NOT acceptable - the
   ## Summary and ## Changes sections are required. Keep pushing after each
   step (step 2) so the draft PR always reflects your latest work.

4. When ALL your work is committed and pushed and the repo's checks pass,
   mark the PR ready for review:

       gh pr ready

   Do NOT merge, close, edit, or review the PR. Never run \`gh pr merge\`,
   \`gh pr close\`, \`gh pr edit\`, or \`gh pr review\` - a human reviews and merges.
   If you run low on turns or context before finishing, stop starting new
   work, make sure everything is committed and pushed, and leave the PR as a
   draft for a human to pick up.

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

End with a one-sentence summary of what you changed (or what you found, if
no changes). Your summary and the run's result are posted to the workflow
job summary - you do not need to call any GitHub APIs to report.

## Environment

- \`gh\` CLI is authenticated via GITHUB_TOKEN.
- \`git\` is configured with the github-actions[bot] identity.
- Full file access to the checkout.
- The runner is ephemeral - unpushed commits are lost when the job ends.`,SYSTEM_ISSUE:`# GitHub Issue Agent

You are running in CI on issue #{{issueNumber}}.

The runner filesystem is ephemeral. Any change you do not commit and
push to a remote branch is lost when the job ends.

## Working style

Use TodoWrite to track your plan. Update it as you make progress - the
runner publishes your todos to the issue comment automatically, so you do
not need to comment on the issue yourself.

Your todos render as Markdown in that comment, where GitHub turns \`#123\`
into a link to issue/PR 123 and \`@name\` into a mention that pings a real
user. Only write \`#123\` or \`@name\` when you deliberately mean that exact
issue, PR, or person. For ordinary numbering or counts inside a todo, drop
the \`#\` - write "step 1", "3 of 5 files", "PR 96" - so you never link an
unrelated or non-existent ticket.

If a tool call fails (an Edit that does not apply, a rejected command),
the change did NOT happen. Re-read the file, fix the call, and retry.
Never mark a todo completed - or claim success - based on a failed call.

To read a file in another repository, use \`gh api repos/<owner>/<repo>/contents/<path>\`,
\`gh repo view <owner>/<repo>\`, \`gh pr view\`, or \`gh issue view\` \u2014 tools that the CLI
already handles well. Reserve \`gh search code\` for when the file location is genuinely
unknown; note it is heavily rate-limited and should be used for at most one or two
queries.

When a CLI call fails and the error includes "unknown flag", the usage text printed
in the error message is the authoritative list of valid flags. Pick from those listed
flags instead of guessing another variant.

For questions or discussion (no code changes), just answer and stop -
skip the steps below.

## Code changes

If you will make code changes, follow this order. Do NOT defer commits to
the end of the run.

NEVER commit on or push to \`main\`/\`master\` - branch protection rejects the
push and the work is stranded. All work happens on the working branch.

1. BEFORE any file edits, get onto the working branch. Do not call
   Edit/Write before this step succeeds - those edits will be lost.

   No existing work for this issue (no "Existing work for this issue"
   section in the task, and no \`fix/issue-{{issueNumber}}\` branch on the
   remote)? Create and push the branch now:

       git checkout -B fix/issue-{{issueNumber}}
       git push -u origin fix/issue-{{issueNumber}}

   Otherwise CONTINUE the existing work - check it out and build on top of
   it, do NOT reset it:

       gh pr checkout <number>                       # for a linked PR, or:
       git fetch origin fix/issue-{{issueNumber}} && git checkout fix/issue-{{issueNumber}}

   Never run \`git checkout -B\` against an existing branch - that throws away
   the prior commits. Already on another branch? Stay on it.

   Before your first edit, confirm \`git branch --show-current\` does NOT
   report \`main\` or \`master\`. If it does, go back and create the branch.

2. AFTER each TodoWrite item you flip to "completed", validate then commit:

       <run the repo's checks and fix any failures>
       git add -A
       git commit -m "<type>(<scope>): <description>"
       git push origin fix/issue-{{issueNumber}}

   (If step 1 put you on a different branch, push that branch by name
   instead - never \`main\`.)

   Before committing, run the repository's own checks - lint, format,
   type-check, tests (e.g. \`npm run lint\`, \`npm test\`, \`task lint\` -
   whatever the repo provides) - and fix the failures. CI runs only AFTER
   this job ends, so you cannot fix it later. Do not batch commits. The job
   has a turn limit; if you defer commits, partial work is destroyed when
   the runner ends.

3. As soon as your FIRST commit is pushed, make sure a DRAFT pull request
   exists. Open it now, early - not at the end - so your work is preserved
   as a PR even if the run is cut off before you finish. Write the
   description to a file first with the Write tool (this avoids
   shell-quoting problems with multi-line text), then pass it with
   --body-file:

       <use the Write tool to write the PR description to /tmp/pr-body.md>

       gh pr create --draft --base main --head fix/issue-{{issueNumber}} \\
         --title "<type>(<scope>): <what changed>" \\
         --body-file /tmp/pr-body.md

   If you continued an existing PR/branch (step 1), one is already open -
   just keep pushing to it; do NOT run \`gh pr create\` again (it errors when
   a PR already exists).

   Write /tmp/pr-body.md from the actual diff. It must contain:

       Resolves #{{issueNumber}}

       ## Summary
       <2-4 sentences: what changed and why>

       ## Changes
       <bullet list of the notable changes>

   A one-line body such as "Fixes #{{issueNumber}}" is NOT acceptable - the
   ## Summary and ## Changes sections are required. Keep pushing after each
   step (step 2) so the draft PR always reflects your latest work.

4. When ALL your work is committed and pushed and the repo's checks pass,
   mark the PR ready for review:

       gh pr ready

   Do NOT merge, close, edit, or review the PR. Never run \`gh pr merge\`,
   \`gh pr close\`, \`gh pr edit\`, or \`gh pr review\` - a human reviews and merges.
   If you run low on turns or context before finishing, stop starting new
   work, make sure everything is committed and pushed, and leave the PR as a
   draft for a human to pick up.

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

- \`gh\` CLI is authenticated via GITHUB_TOKEN.
- \`git\` is configured with the github-actions[bot] identity.
- Full file access to the checkout.
- The runner is ephemeral - unpushed commits are lost when the job ends.`,SYSTEM_PR_FORK:`# GitHub PR Agent (view-only)

You are running in CI on PR #{{prNumber}}. The PR's head branch
\`{{headRef}}\` lives in a fork (\`{{headRepoFullName}}\`) and has
been fetched read-only for you to inspect.

## Working style

Use TodoWrite to track your plan. Update it as you make progress - the
runner publishes your todos to the PR comment automatically.

Your todos render as Markdown in that comment, where GitHub turns \`#123\`
into a link to issue/PR 123 and \`@name\` into a mention that pings a real
user. Only write \`#123\` or \`@name\` when you deliberately mean that exact
issue, PR, or person. For ordinary numbering or counts inside a todo, drop
the \`#\` - write "step 1", "3 of 5 files", "PR 96" - so you never link an
unrelated or non-existent ticket.

The user's latest ask is in the "Triggering comment" section of your task.
Address that ask directly.

To read a file in another repository, use \`gh api repos/<owner>/<repo>/contents/<path>\`,
\`gh repo view <owner>/<repo>\`, \`gh pr view\`, or \`gh issue view\` \u2014 tools that the CLI
already handles well. Reserve \`gh search code\` for when the file location is genuinely
unknown; note it is heavily rate-limited and should be used for at most one or two
queries.

When a CLI call fails and the error includes "unknown flag", the usage text printed
in the error message is the authoritative list of valid flags. Pick from those listed
flags instead of guessing another variant.

## You cannot commit or push

This PR's head lives in a fork. The runner does not have write access to
the fork's branch. DO NOT run \`git commit\`, \`git push\`,
\`gh pr create\`, \`gh pr merge\`, \`gh pr close\`, \`gh pr edit\`, or
\`gh pr review\`. Any attempt will fail.

Instead: read files, run \`git diff origin/{{baseRef}}...HEAD\`,
\`git log\`, and the repo's own checks (lint, tests) to investigate.
Answer the user's question or summarise findings.

## Output

End with a one-sentence summary of what you found. Do not call any
GitHub comment APIs - the runner posts your result.

## Environment

- \`gh\` CLI is authenticated via GITHUB_TOKEN (read access only on the
  fork's head branch).
- Full file access to the checkout, on a detached read-only copy of the
  fork's head.
- The runner is ephemeral.`,SYSTEM_PR:`# GitHub PR Agent

You are running in CI on PR #{{prNumber}}. The PR's head branch
\`{{headRef}}\` is already checked out for you.

The runner filesystem is ephemeral. Any change you do not commit and
push is lost when the job ends.

## Working style

Use TodoWrite to track your plan. Update it as you make progress - the
runner publishes your todos to the PR comment automatically, so you do
not need to comment on the PR yourself.

Your todos render as Markdown in that comment, where GitHub turns \`#123\`
into a link to issue/PR 123 and \`@name\` into a mention that pings a real
user. Only write \`#123\` or \`@name\` when you deliberately mean that exact
issue, PR, or person. For ordinary numbering or counts inside a todo, drop
the \`#\` - write "step 1", "3 of 5 files", "PR 96" - so you never link an
unrelated or non-existent ticket.

If a tool call fails (an Edit that does not apply, a rejected command),
the change did NOT happen. Re-read the file, fix the call, and retry.
Never mark a todo completed - or claim success - based on a failed call.

To read a file in another repository, use \`gh api repos/<owner>/<repo>/contents/<path>\`,
\`gh repo view <owner>/<repo>\`, \`gh pr view\`, or \`gh issue view\` \u2014 tools that the CLI
already handles well. Reserve \`gh search code\` for when the file location is genuinely
unknown; note it is heavily rate-limited and should be used for at most one or two
queries.

When a CLI call fails and the error includes "unknown flag", the usage text printed
in the error message is the authoritative list of valid flags. Pick from those listed
flags instead of guessing another variant.

The user's latest ask is in the "Triggering comment" section of your task.
Address that ask directly. Do NOT re-implement existing changes unless
the user is asking for that.

For questions or discussion (no code changes), just answer and stop -
skip the steps below.

## Code changes

If you will make code changes, follow this order. Do NOT defer commits
to the end of the run.

1. You are ALREADY on branch \`{{headRef}}\`. DO NOT create a new branch.
   DO NOT run \`git checkout -b\` or \`git checkout -B\`. Verify with
   \`git rev-parse --abbrev-ref HEAD\` if uncertain - it must report
   \`{{headRef}}\`.

2. AFTER each TodoWrite item you flip to "completed", validate then commit:

       <run the repo's checks and fix any failures>
       git add -A
       git commit -m "<type>(<scope>): <description>"
       git push

   Before committing, run the repository's own checks - lint, format,
   type-check, tests (e.g. \`npm run lint\`, \`npm test\`, \`task lint\` -
   whatever the repo provides) - and fix the failures. CI runs only AFTER
   this job ends, so you cannot fix it later. Do not batch commits. The
   job has a turn limit; if you defer commits, partial work is destroyed
   when the runner ends.

3. The pull request ALREADY EXISTS (PR #{{prNumber}}). DO NOT run
   \`gh pr create\`. DO NOT run \`gh pr merge\`, \`gh pr close\`, or
   \`gh pr review\`. You MAY update this PR's title and description
   with \`gh pr edit {{prNumber}} --title ... --body ...\` when the
   task calls for it. Your pushes to \`{{headRef}}\`
   update the existing PR automatically. If you run low on turns or
   context before finishing, stop starting new work and make sure
   everything is committed and pushed - your pushes are the PR.

Use Conventional Commits: \`type(scope): description\` (feat, fix, docs,
style, refactor, test, chore).

Before you finish, if you changed files: \`git status\` must be clean and
\`git status -sb\` must show no "[ahead" - commit and push anything left.

## Output

End with a one-sentence summary of what you changed (or what you found,
if no changes). Do not call any GitHub comment APIs - the runner posts
your result.

## Environment

- \`gh\` CLI is authenticated via GITHUB_TOKEN.
- \`git\` is configured with the github-actions[bot] identity.
- Full file access to the checkout, already on the PR head branch.
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

Run \`git diff origin/{{baseRef}}...HEAD\` for the full diff and \`git log origin/{{baseRef}}..HEAD\` for the commit history.{{triggerSection}}`};function dn(n){let h=process.env[`INFER_PROMPT_OVERRIDE_${n}`];return h&&h.trim()?h:wn[n]}function gn(n){let h=process.env[`INFER_PROMPT_OVERRIDE_${n}`];return h&&h.trim()?h:null}var mn={SYSTEM_ISSUE:["git commit","git push","gh pr create","gh pr ready","git status"],SYSTEM_DIRECT:["git commit","git push","gh pr create","gh pr ready","git status"],SYSTEM_PR:["git commit","git push","git status"],SYSTEM_PR_FORK:["git commit","git push"]};function bn(n){if(n.kind==="issue")return"SYSTEM_ISSUE";if(n.kind==="direct")return"SYSTEM_DIRECT";if(n.isFork)return"SYSTEM_PR_FORK";return"SYSTEM_PR"}function rn(n){let h=bn(n),o=gn(h);if(o===null)return[];let a=mn[h];if(!a||a.length===0)return[];let i=a.filter((f)=>!o.includes(f));return i.length>0?[{key:h,missing:i}]:[]}function W(n,h={}){return dn(n).replace(/\{\{(\w+)\}\}/g,(o,a)=>{if(!(a in h))throw Error(`Missing variable "${a}" for prompt "${n}"`);return String(h[a])})}function tn(n,h={}){if(n.kind==="issue")return xn(n);if(n.kind==="direct")return pn(n);return hh(n,h.diffStat??"")}function yn(n,h){let o=cn(n);if(h.trim())return`${o}

## Additional Instructions

${h}`;return o}function cn(n){if(n.kind==="issue")return W("SYSTEM_ISSUE",{issueNumber:n.issueNumber});if(n.kind==="direct")return W("SYSTEM_DIRECT");if(n.isFork)return W("SYSTEM_PR_FORK",{prNumber:n.prNumber,headRef:n.headRef,headRepoFullName:n.headRepoFullName,baseRef:n.baseRef});return W("SYSTEM_PR",{prNumber:n.prNumber,headRef:n.headRef})}function pn(n){return W("TASK_DIRECT",{prompt:n.prompt})}function xn(n){let h=n.triggeringComment?`

## Triggering comment from @${n.triggeringComment.author}

${n.triggeringComment.body}

Treat this comment as the user's most recent intent. If it asks for something more specific than the issue body, prioritise it.`:"";return W("TASK_ISSUE",{issueNumber:n.issueNumber,issueTitle:n.issueTitle,issueBody:n.issueBody,existingWorkSection:nh(n),recentCommentsSection:ln((n.threadComments??[]).filter((o)=>!o.isTrigger),"Recent comments (chronological)"),triggeringCommentSection:h})}function ln(n,h){let o=n.filter((s)=>!s.author.endsWith("[bot]")),a=o.slice(-3);if(a.length===0)return"";let i=o.length-a.length,f=i>0?`_\u2026${i} earlier comment${i===1?"":"s"} omitted_

`:"";return`

## ${h}

${f}${a.map(kn).join(`

`)}`}function nh(n){let h=n.associatedPrs??[],o=n.associatedBranches??[];if(h.length===0&&o.length===0)return"";let a=["## Existing work for this issue","A prior run or another contributor may already have started on this issue. Before creating a branch, inspect the items below and CONTINUE from them if they contain relevant work - check it out (`gh pr checkout <number>`, or `git fetch origin <branch> && git checkout <branch>`) and build on top of it rather than starting fresh. Only start a new branch if none of these apply."];if(h.length){let i=h.map((f)=>{let s=f.isDraft?" (draft)":"",e=f.state&&f.state!=="open"?` [${f.state}]`:"",u=f.headRef?` - branch \`${f.headRef}\``:"",t=f.title?` - ${f.title}`:"";return`- PR #${f.number}${s}${e}${u}: ${f.url}${t}`});a.push(`### Pull requests

`+i.join(`
`))}if(o.length)a.push(`### Branches

`+o.map((i)=>`- \`${i}\``).join(`
`));return`

`+a.join(`

`)}function hh(n,h){let o=n.isFork?`
Head lives in a fork: ${n.headRepoFullName}. You CANNOT push commits to it from this runner.`:"",a=n.comments.find((t)=>t.isTrigger),i=a?`

## Triggering comment from @${a.author} (id: ${a.id})

${a.body}

This is the user's most recent ask. Address it directly. Do not re-implement existing changes unless this comment asks for that.`:"",f=n.comments.filter((t)=>!t.isTrigger);if(n.reviewComment)return oh(n,n.reviewComment,{forkNotice:o,triggerSection:i,others:f});let s=ln(f,"Other comments (chronological)"),e=n.prBody.trim()?n.prBody:"_(no description)_",u=h.trim()?"```\n"+h.trim()+"\n```":"_(no changes on this branch yet)_";return W("TASK_PR",{prNumber:n.prNumber,prTitle:n.prTitle,headRef:n.headRef,baseRef:n.baseRef,forkNotice:o,prBody:e,triggerSection:i,otherCommentsSection:s,diffStatSection:u})}function oh(n,h,o){let a=h.startLine&&h.line&&h.startLine!==h.line?`, lines ${h.startLine}-${h.line}`:h.line?`, line ${h.line}`:"",i=o.others.length>0?`

## Earlier comments in this review thread

${o.others.map(kn).join(`

`)}`:"";return W("TASK_PR_REVIEW",{prNumber:n.prNumber,prTitle:n.prTitle,headRef:n.headRef,baseRef:n.baseRef,forkNotice:o.forkNotice,filePath:h.path,lineInfo:a,diffHunk:h.diffHunk,threadSection:i,triggerSection:o.triggerSection})}function kn(n){return`**@${n.author}** \xB7 ${n.createdAt}

${n.body}`}function ah(n,h){let o=[],a=h.enableGitOps&&!(n.kind==="pull_request"&&n.isFork);if(o.push({name:"infer-action-context",hook:"pre_stream",trigger:"interval",interval:5,text:h.enableGitOps?ih(n):"<system-reminder>Keep your TodoWrite plan current as you go. Only answering a question? Ignore this.</system-reminder>"}),a)o.push({name:"infer-action-wrap-up",hook:"pre_stream",trigger:"turns_before_max",threshold:10,text:fh(n)}),o.push({name:"infer-action-failed-tool",hook:"post_tool",trigger:"on_failure",text:sh()});return o}function ih(n){if(n.kind==="pull_request"&&n.isFork)return"<system-reminder>This PR is from a fork - you CANNOT commit or push. Investigate with file reads and git diff, then answer the user's question or summarise. Keep your TodoWrite plan current.</system-reminder>";if(n.kind==="pull_request")return`<system-reminder>Keep your TodoWrite plan current, and commit + push after each step so PR #${n.prNumber} stays current - unpushed work is lost when the job ends.</system-reminder>`;return"<system-reminder>Keep your TodoWrite plan current. Changing code? Work on a pushed branch with an open draft PR (`gh pr create --draft`) and commit + push after each step so nothing is lost - never commit on or push to main. Only answering a question? Ignore this.</system-reminder>"}function fh(n){return`<system-reminder>You are close to the turn limit. Stop starting new work - commit and push everything now ${n.kind==="pull_request"?`so PR #${n.prNumber} is up to date`:"and make sure the draft PR exists (`gh pr create --draft`)"}. Unpushed work is lost when the run ends.</system-reminder>`}function sh(){return"<system-reminder>That tool call FAILED - the change did NOT happen. Re-read or re-check, fix it, and retry. Never mark a todo done or claim success on a failed call.</system-reminder>"}function eh(n){let h=["enabled: true","merge: true","reminders:"];for(let o of n){if(h.push(`  - name: ${JSON.stringify(o.name)}`),h.push(`    hook: ${JSON.stringify(o.hook)}`),h.push(`    trigger: ${JSON.stringify(o.trigger)}`),o.interval!==void 0)h.push(`    interval: ${o.interval}`);if(o.threshold!==void 0)h.push(`    threshold: ${o.threshold}`);h.push(`    text: ${JSON.stringify(o.text)}`)}return h.join(`
`)+`
`}function Rn(n,h,o){let a=n.trim();if(a)return a.endsWith(`
`)?a:a+`
`;return eh(ah(h,o))}import{execFileSync as uh}from"child_process";import{appendFileSync as Wn,existsSync as xh,readFileSync as wh,rmSync as rh,writeFileSync as th}from"fs";var yh=60000;function Yn(){try{th(M,"1")}catch(n){console.error("[runner] failed to write cancel marker:",n)}}function qn(){try{rh(M,{force:!0})}catch{}}function Hn(n,h=A){try{return h(`git diff --stat origin/${lh(n)}...HEAD`)}catch(o){return console.error("[runner] git diff --stat failed:",o),""}}function Dn(n,h=(o)=>o){try{let i=wh(J,"utf8").split(`
`).filter((f)=>f.trim()!=="").slice(-n);if(i.length===0)return;console.error("=========================================="),console.error(`[recover] last ${i.length} line(s) of agent activity before it stopped:`),console.error("------------------------------------------");for(let f of i){let s=f.length>2000?f.slice(0,2000)+" \u2026":f;console.error(h(s))}console.error("==========================================")}catch(o){console.error("[recover] could not read agent transcript for breadcrumb:",o)}}function A(n){return uh("bash",["-c",n],{encoding:"utf8",timeout:yh,env:{...process.env,GIT_TERMINAL_PROMPT:"0"}})}function lh(n){return`'${n.replace(/'/g,"'\\''")}'`}function H(n,h){let o=process.env.GITHUB_OUTPUT;if(!o){console.log(`(would set output) ${n}=${h}`);return}if(h.includes(`
`)){let a=`_GHO_EOF_${Math.random().toString(36).slice(2)}`;Wn(o,`${n}<<${a}
${h}
${a}
`)}else Wn(o,`${n}=${h}
`)}function On(n){return typeof n==="object"&&n!==null&&n.role==="tool"&&typeof n.content==="string"}function Kn(n){if(typeof n!=="object"||n===null)return!1;let h=n.type;return h==="compaction_started"||h==="compaction_completed"}var $n="Result of tool call: ";function jn(n){if(!n.startsWith($n))return null;let h=n.slice($n.length);try{let o=JSON.parse(h);if(typeof o==="object"&&o!==null)return o;return null}catch{return null}}class L{handlers=new Map;flushers=[];listeners=[];on(n,h){return this.handlers.set(n,h),this}onMessage(n){return this.listeners.push(n),this}addFlusher(n){return this.flushers.push(n),this}async observe(n){for await(let h of n){for(let i of this.listeners)try{i(h)}catch(f){console.error("[ticker] message listener threw:",f)}if(!On(h))continue;let o=jn(h.content);if(!o?.tool_name)continue;let a=this.handlers.get(o.tool_name);if(!a)continue;try{await a(o,h)}catch(i){console.error(`[ticker] handler for ${o.tool_name} threw:`,i)}}}async flush(){for(let n of this.flushers)try{await n()}catch(h){console.error("[ticker] flusher threw:",h)}}}function Jn(n,h){let o=null,a=null,i=null,f=async()=>{if(a=null,!o)return;let s=o.value;o=null,i=n(s).catch((e)=>{console.error("[throttle] fn threw:",e)}).finally(()=>{i=null}),await i};return{call(s){if(o={value:s},!a)a=setTimeout(()=>{f()},h)},async flush(){if(a)clearTimeout(a),a=null;if(o)await f();else if(i)await i}}}function Xn(n){let h=Math.floor(n/1000);if(h<60)return`${h}s`;let o=Math.floor(h/60),a=h%60;if(o<60)return`${o}m ${a}s`;let i=Math.floor(o/60),f=o%60;return`${i}h ${f}m ${a}s`}var qh=1500;async function Hh(){let{dryRun:n,enableGitOps:h,redactor:o,github:a}=en(),i=y("INFER_COOKING_COMMENT_ID"),f=i?Number.parseInt(i,10):0,s=Number.isFinite(f)&&f>0,e=y("INFER_WORKFLOW_URL"),u=j("INFER_AGENT_MODEL"),t=y("INFER_CUSTOM_INSTRUCTIONS"),X=y("INFER_BASH_ALLOW_APPEND"),R=y("INFER_LOGGING_DEBUG")==="true",B=x(process.env),l=await un(process.env,a,{stepName:"dry-run",failHard:!n});if(l.kind==="pull_request"&&h)try{Xh(l)}catch(w){if(!n)throw w;console.warn("[dry-run] PR head checkout failed; continuing on the current branch:",w instanceof Error?w.message:w)}let Qn=l.kind==="pull_request"?Hn(l.baseRef):"",E=yn(l,t),I=tn(l,{diffStat:Qn});if(h)for(let w of rn(l)){let r=w.key.replace(/^SYSTEM_/,"").toLowerCase().replace(/_/g,"-");process.stdout.write(`::warning::INFER_PROMPT_OVERRIDE_${w.key} replaces the bundled system prompt (system-prompt-${r} / src/prompts/system-${r}.md) and is missing the git-safety markers: ${w.missing.join(", ")}. The default guards against lost work (branch-first, commit-per-todo, push, draft PR, finish checklist); your override dropped those instructions, so the agent may leave changes uncommitted or unpushed. Re-add them to your override, or use the custom-instructions input to layer extras on top of the default instead of replacing it.
`)}let Fn=y("INFER_REMINDERS_CONFIG"),_=Rn(Fn,l,{enableGitOps:h}),N=b(h,X),Z=y("INFER_BIN")||"infer",v=Dh(process.env,{systemPrompt:E,bashAllowAppend:N,remindersYaml:_});console.log("=========================================="),console.log("SYSTEM PROMPT:"),console.log("==========================================");let C=y("INFER_BIN")?void 0:$h(Z,v);if(console.log(C===void 0?E:Oh(C,R)),console.log("=========================================="),console.log(""),console.log("Running agent with task:"),console.log(I),console.log("---"),n)console.log("=========================================="),console.log("DRY RUN - the agent would be invoked with:"),console.log("=========================================="),console.log(`Model:        ${u}`),console.log(`Context kind: ${l.kind}`),console.log(`Git ops:      ${h?"enabled":"disabled"}`),console.log(`INFER_BIN:    ${Z}`),console.log("--- REMINDERS (INFER_REMINDERS_CONFIG) ---"),console.log(_),console.log("--- BASH ALLOW-LIST APPEND (added to the CLI read-only baseline) ---"),console.log(N||"(none - CLI read-only baseline only)"),console.log("==========================================");Gh(),qn();let Gn=Date.now(),k=kh(Z,["agent","-m",u,I],{stdio:["inherit","pipe","pipe"],env:v});if(!k.stdout||!k.stderr)throw Error("child stdio not piped - this should not happen");let S=!1,d=!1,g=(w)=>{if(d)return;d=!0,S=!0,Yn(),console.error(`[runner] received ${w}; stopping the agent so the salvage step can recover its work`);try{k.kill("SIGKILL")}catch(r){console.error("[runner] failed to stop agent child:",r)}};process.once("SIGTERM",()=>g("SIGTERM")),process.once("SIGINT",()=>g("SIGINT"));let D=Wh(J),m=new Yh;if(k.stdout.pipe(D,{end:!1}),B.stdout)k.stdout.pipe(process.stdout,{end:!1});else console.log("[runner] agent stdout muted (set INFER_MIRROR_AGENT_LOGS=true to mirror); stderr still shown, full transcript written to /tmp/agent-output.txt");k.stdout.pipe(m),k.stdout.on("end",()=>D.end()),k.stderr.on("data",(w)=>{if(D.write(w),B.stderr)process.stderr.write(w)});let Y=new L,$=s?Jn(async(w)=>{let r=jh(w,e,u);try{await a.updateZone(f,"plan",r),console.log(`[ticker] updated plan section (${w.length} todos)`)}catch(Un){console.error("[ticker] PATCH failed:",Un)}},qh):null;if($)Y.addFlusher($.flush);else console.log("[ticker] no cooking comment; plan mirroring disabled (direct mode)");if(Y.on("TodoWrite",(w)=>{let r=w.data?.todos;if(!Array.isArray(r))return;if(Fh(r),$)$.call(r)}),R)Y.onMessage((w)=>{if(Kn(w)){console.log(w.type==="compaction_started"?"[agent] context compaction started (summarising older turns)\u2026":"[agent] context compaction completed");return}let r=w;if(r.role==="user"&&r.hidden===!0&&r.kind==="system_reminder")console.log("[agent] system reminder injected")});await Y.observe(nn(m)),await Y.flush();let q=await Zh(k),Q=Date.now()-Gn;if(console.log(""),console.log("=========================================="),console.log(`Agent exited with code ${q}`),console.log(`Duration: ${Xn(Q)}`),console.log("=========================================="),S)return H("run-duration-ms",String(Q)),await Qh(D),Dn(40,o.redact),console.error("[runner] cancelled mid-run; the salvage step will recover any work and report the timeout"),130;return H("exit-code",String(q)),H("run-duration-ms",String(Q)),H("result",q===0?"Agent completed successfully":`Agent failed with exit code ${q}`),q}function Dh(n,h){return{...n,INFER_PROMPTS_AGENT_SYSTEM_PROMPT:h.systemPrompt,INFER_PROMPTS_AGENT_SYSTEM_PROMPT_CLAUDE_CODE:h.systemPrompt,INFER_AGENT_SYSTEM_PROMPT_WITH_DEFAULTS:"true",INFER_TOOLS_BASH_ALLOW_APPEND:h.bashAllowAppend,INFER_REMINDERS_CONFIG:h.remindersYaml}}function $h(n,h){try{let o=Rh(n,["debug","agent","system_prompt"],{env:h,encoding:"utf8",timeout:30000});if(o.status!==0||!o.stdout?.trim())return;return o.stdout}catch{return}}function Oh(n,h){if(h)return n;let o=n.indexOf("PERSISTENT MEMORY INDEX");if(o===-1)return n;let a=n.slice(o),i=a.indexOf(`

Current date:`),f=i===-1?"":a.slice(i);return`${n.slice(0,o)}PERSISTENT MEMORY INDEX: [redacted - set debug: true to include memory entries]${f}`}function Kh(n,h){let o=[`**Model:** \`${h}\``];if(n)o.push(`[View Job](${n})`);return`${p}

${o.join(" \xB7 ")}`}function jh(n,h,o){let a=Kh(h,o);if(n.length===0)return`${a}

### Todos

_(agent has not posted a plan yet)_`;let i=n.map((f)=>{return`- ${f.status==="completed"?"[x]":f.status==="in_progress"?"[~]":"[ ]"} ${f.content}`});return[a,"","### Todos","",...i].join(`
`)}function Jh(n){let h=n.stderr;return((typeof h==="string"?h:"")+String(n.message)).includes("couldn't find remote ref")}function Xh(n,h=A){try{if(n.isFork){let o=`pr-${n.prNumber}`;console.log(`[runner] fork PR; fetching pull/${n.prNumber}/head into ${o}`),h(`git fetch origin pull/${n.prNumber}/head:${o}`),h(`git checkout ${o}`)}else{console.log(`[runner] checking out PR head branch ${n.headRef}`);try{h(`git fetch origin ${n.headRef}`)}catch(o){if(!Jh(o))throw o;process.stdout.write(`::warning::PR head branch ${n.headRef} no longer exists on origin (likely deleted when the PR was closed or merged); recreating it from pull/${n.prNumber}/head. If the PR is closed or merged, pushing will not reopen it.
`),h(`git fetch origin pull/${n.prNumber}/head:${n.headRef}`)}h(`git checkout ${n.headRef}`)}}catch(o){throw Error(`Failed to check out PR head (${n.headRef}). Aborting before spawning the agent so it doesn't run against the wrong branch.`,{cause:o})}}async function Zh(n){if(n.exitCode!==null)return n.exitCode;return new Promise((h)=>{n.on("close",(o)=>h(o??0))})}async function Qh(n){if(n.writableFinished)return;await Promise.race([new Promise((h)=>n.once("finish",h)),new Promise((h)=>setTimeout(h,2000).unref())])}function Fh(n){try{Zn(T,JSON.stringify(n))}catch(h){console.error("[runner] failed to persist todos:",h)}}function Gh(){try{Zn(T,"[]")}catch{}}if(import.meta.main)Hh().then((n)=>process.exit(n),(n)=>{console.error("[runner] uncaught error:",n),process.exit(1)});export{$h as resolveMergedSystemPrompt,jh as renderPlan,Oh as redactMemoryIndex,Xh as ensurePrHeadCheckedOut,Dh as buildChildEnv};
