#!/usr/bin/env bun
// @bun
import{spawn as Hf,spawnSync as Of}from"child_process";import{createWriteStream as zf,writeFileSync as mh}from"fs";import{PassThrough as Df}from"stream";var wn=["git add( .*)?","git commit( .*)?","git push( .*)?","git checkout( .*)?","git switch( .*)?","git fetch( .*)?","git restore( .*)?","git reset( .*)?","git stash( .*)?","gh pr create( .*)?","gh pr ready( .*)?","gh pr edit( [0-9]+)? --(title|body|body-file)( .*)?",String.raw`gh api graphql -f query='query ?[({][^']*'( --jq '[^']*')?`,String.raw`gh api graphql -f query='mutation\(\$id:ID!\)\{resolveReviewThread\(input:\{threadId:\$id\}\)\{thread\{isResolved\}\}\}' -f id=PRRT_[A-Za-z0-9_-]+`],kn=["tmux (send-keys|capture-pane)( .*)?","ffmpeg( .*)?"];function Wh(h,n,f=!1){return[...h?wn:[],...f?kn:[],n.trim()].filter(Boolean).join(",")}import{spawnSync as Rh}from"child_process";import{readFileSync as fw,writeFileSync as Rn}from"fs";import{homedir as jn}from"os";import{join as Fn}from"path";async function Yh(h,n){let f=h.INFER_CONTEXT_KIND;if(!f)throw Error("Missing required env var INFER_CONTEXT_KIND");if(f==="issue")return yn(h,n);if(f==="pull_request")return un(h,n);if(f==="direct")return qn(h);throw Error(`Unknown INFER_CONTEXT_KIND "${f}" (expected "issue", "pull_request", or "direct")`)}function uh(h){let n=h.INFER_CONTEXT_KIND;if(n==="direct")return{kind:"direct",prompt:(h.INFER_DIRECT_PROMPT??"").trim()||"(dry-run: no prompt)"};if(n==="pull_request"){let f=$h(h),w=f?S(h):void 0;return{kind:"pull_request",prNumber:Number.parseInt(h.INFER_ISSUE_NUMBER??"0",10)||0,prTitle:"(dry-run: PR title unavailable)",prBody:"",headRef:"(unknown)",baseRef:"main",headRepoFullName:"",isFork:!1,prState:"open",triggeringCommentId:w?.id??0,comments:w?[{id:w.id,author:w.author,body:w.body,createdAt:"",isTrigger:!0}]:[],...f?{reviewComment:f}:{}}}return{kind:"issue",issueNumber:Number.parseInt(h.INFER_ISSUE_NUMBER??"0",10)||0,issueTitle:h.INFER_ISSUE_TITLE??"",issueBody:h.INFER_ISSUE_BODY??""}}function qn(h){let n=(h.INFER_DIRECT_PROMPT??"").trim();if(!n)throw Error("Missing or empty INFER_DIRECT_PROMPT for direct context");return{kind:"direct",prompt:n}}async function yn(h,n){let f=Number.parseInt(h.INFER_ISSUE_NUMBER??"",10);if(!Number.isFinite(f))throw Error("Missing or invalid INFER_ISSUE_NUMBER");let w=h.INFER_ISSUE_TITLE??"",k=h.INFER_ISSUE_BODY??"",q=S(h),[{associatedPrs:y,associatedBranches:W},Y]=await Promise.all([Yn(n,f),Wn(n,f,q?.id??0)]);return{kind:"issue",issueNumber:f,issueTitle:w,issueBody:k,...q?{triggeringComment:q}:{},...y.length?{associatedPrs:y}:{},...W.length?{associatedBranches:W}:{},...Y.length?{threadComments:Y}:{}}}async function Wn(h,n,f){try{return(await h.listIssueComments(n)).map((k)=>({id:k.id,author:k.author,body:k.body,createdAt:k.createdAt,isTrigger:f>0&&k.id===f}))}catch(w){return console.warn(`[context] failed to list comments for issue #${n}; proceeding without the thread:`,w instanceof Error?w.message:w),[]}}async function Yn(h,n){let f=`fix/issue-${n}`;try{let[w,k]=await Promise.all([h.getOpenPrForBranch(f),h.findPrsReferencingIssue(n)]),q=new Map;for(let Y of k)q.set(Y.number,Y);if(w){let Y=q.get(w.number);q.set(w.number,{number:w.number,url:Y?.url||w.url,state:Y?.state||"open",headRef:f,baseRef:w.baseRef,isDraft:Y?.isDraft??!1,title:Y?.title??""})}return{associatedPrs:[...q.values()],associatedBranches:w?[f]:[]}}catch(w){return console.warn(`[context] failed to gather existing work for issue #${n}; proceeding without it:`,w instanceof Error?w.message:w),{associatedPrs:[],associatedBranches:[]}}}async function un(h,n){let f=Number.parseInt(h.INFER_ISSUE_NUMBER??"",10);if(!Number.isFinite(f))throw Error("Missing or invalid INFER_ISSUE_NUMBER for PR context");let w=Number.parseInt(h.INFER_TRIGGERING_COMMENT_ID??"",10),k=Number.isFinite(w)?w:0,q=$h(h),[y,W]=await Promise.all([n.getPullRequest(f),q?$n(h,n,f,k):n.listIssueComments(f).then((Q)=>Q.map((z)=>({id:z.id,author:z.author,body:z.body,createdAt:z.createdAt,isTrigger:k>0&&z.id===k})))]),Y=`${n.owner}/${n.repoName}`,J=y.headRepoFullName!==""&&y.headRepoFullName!==Y;return{kind:"pull_request",prNumber:f,prTitle:y.title,prBody:y.body,headRef:y.headRef,baseRef:y.baseRef,headRepoFullName:y.headRepoFullName,isFork:J,prState:y.state,triggeringCommentId:k,comments:on(W,h),...q?{reviewComment:q}:{}}}function $h(h){let n=(h.INFER_REVIEW_COMMENT_PATH??"").trim();if(!n)return;let f=Number.parseInt(h.INFER_REVIEW_COMMENT_LINE??"",10),w=Number.parseInt(h.INFER_REVIEW_COMMENT_START_LINE??"",10);return{path:n,diffHunk:h.INFER_REVIEW_COMMENT_DIFF_HUNK??"",...Number.isFinite(f)?{line:f}:{},...Number.isFinite(w)?{startLine:w}:{}}}async function $n(h,n,f,w){let k=Number.parseInt(h.INFER_REVIEW_COMMENT_IN_REPLY_TO??"",10),q=[];if(Number.isFinite(k)&&k>0){let y=await n.listReviewComments(f);for(let W of y)if(W.id===k||W.inReplyToId===k)q.push({id:W.id,author:W.author,body:W.body,createdAt:W.createdAt,isTrigger:w>0&&W.id===w})}return q}function on(h,n){if(h.some((w)=>w.isTrigger))return h;let f=S(n);return f?[...h,{...f,createdAt:"",isTrigger:!0}]:h}function S(h){let n=h.INFER_TRIGGERING_COMMENT_ID??"",f=h.INFER_TRIGGERING_COMMENT_BODY??"",w=h.INFER_TRIGGERING_COMMENT_AUTHOR??"",k=Number.parseInt(n,10);if(!Number.isFinite(k)||k<=0)return;if(!f.trim())return;return{id:k,body:f,author:w}}var X=100;class a{token;baseUrl;fetchImpl;constructor(h){this.token=h.token,this.baseUrl=(h.baseUrl||process.env.GITHUB_API_URL||"https://api.github.com").replace(/\/+$/,""),this.fetchImpl=h.fetchImpl??fetch}issues={getComment:(h)=>this.request("GET",`/repos/${h.owner}/${h.repo}/issues/comments/${h.comment_id}`),updateComment:(h)=>this.request("PATCH",`/repos/${h.owner}/${h.repo}/issues/comments/${h.comment_id}`,void 0,{body:h.body}),createComment:(h)=>this.request("POST",`/repos/${h.owner}/${h.repo}/issues/${h.issue_number}/comments`,void 0,{body:h.body}),listComments:(h)=>this.request("GET",`/repos/${h.owner}/${h.repo}/issues/${h.issue_number}/comments`,{per_page:h.per_page,page:h.page}),listEventsForTimeline:(h)=>this.request("GET",`/repos/${h.owner}/${h.repo}/issues/${h.issue_number}/timeline`,{per_page:h.per_page})};pulls={list:(h)=>this.request("GET",`/repos/${h.owner}/${h.repo}/pulls`,{head:h.head,state:h.state,per_page:h.per_page}),get:(h)=>this.request("GET",`/repos/${h.owner}/${h.repo}/pulls/${h.pull_number}`),create:(h)=>this.request("POST",`/repos/${h.owner}/${h.repo}/pulls`,void 0,{head:h.head,base:h.base,title:h.title,body:h.body,draft:h.draft}),listComments:(h)=>this.request("GET",`/repos/${h.owner}/${h.repo}/pulls/${h.pull_number}/comments`,{per_page:h.per_page,page:h.page}),update:(h)=>this.request("PATCH",`/repos/${h.owner}/${h.repo}/pulls/${h.pull_number}`,void 0,{body:h.body}),getComment:(h)=>this.request("GET",`/repos/${h.owner}/${h.repo}/pulls/comments/${h.comment_id}`),updateComment:(h)=>this.request("PATCH",`/repos/${h.owner}/${h.repo}/pulls/comments/${h.comment_id}`,void 0,{body:h.body}),createReview:(h)=>this.request("POST",`/repos/${h.owner}/${h.repo}/pulls/${h.pull_number}/reviews`,void 0,{event:h.event,body:h.body,comments:h.comments})};checks={listForRef:(h)=>this.request("GET",`/repos/${h.owner}/${h.repo}/commits/${h.ref}/check-runs`,{per_page:h.per_page??100})};repos={get:(h)=>this.request("GET",`/repos/${h.owner}/${h.repo}`),createOrUpdateFileContents:(h)=>this.request("PUT",`/repos/${h.owner}/${h.repo}/contents/${h.path}`,void 0,{message:h.message,content:h.content,branch:h.branch})};git={getRef:(h)=>this.request("GET",`/repos/${h.owner}/${h.repo}/git/ref/${h.ref}`),createRef:(h)=>this.request("POST",`/repos/${h.owner}/${h.repo}/git/refs`,void 0,{ref:h.ref,sha:h.sha}),createCommit:(h)=>this.request("POST",`/repos/${h.owner}/${h.repo}/git/commits`,void 0,{message:h.message,tree:h.tree})};async request(h,n,f,w){let k=`${this.baseUrl}${n}`;if(f){let W=new URLSearchParams;for(let[Y,J]of Object.entries(f))W.set(Y,String(J));k+=`?${W.toString()}`}let q={Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","User-Agent":"infer-action"};if(this.token)q.Authorization=`Bearer ${this.token}`;if(w!==void 0)q["Content-Type"]="application/json";let y=await this.fetchImpl(k,{method:h,headers:q,...w!==void 0?{body:JSON.stringify(w)}:{}});if(!y.ok){let W=await y.text().catch(()=>"");throw Error(`GitHub API ${h} ${n} -> ${y.status} ${y.statusText}: ${W.slice(0,300)}`)}if(y.status===204)return{data:void 0};return{data:await y.json()}}}function _(h){return typeof h==="object"&&h!==null&&h.role==="tool"&&typeof h.content==="string"}function Jh(h){if(typeof h!=="object"||h===null)return!1;let n=h.type;return n==="compaction_started"||n==="compaction_completed"}var oh="Result of tool call: ";function E(h){let n=h.startsWith(oh)?h.slice(oh.length):h;if(!n.startsWith("{"))return null;try{let f=JSON.parse(n);if(typeof f==="object"&&f!==null)return f;return null}catch{return null}}var U=2000;var Jn=20;function Zh(h){return h.replace(/`/g,"")}var P="<!-- infer:plan-end -->",G="<!-- infer:result-start -->",R="infer-artifacts",Zn="4b825dc642cb6eb9a060e54bf8d69288fbee4904",Kh="<!-- infer:spinner -->",v="<!-- /infer:spinner -->",Qh=`${Kh}<img src="https://raw.githubusercontent.com/inference-gateway/infer-action/main/assets/spinner.svg" width="22" height="22" alt="Working" />${v}`;function Kn(h){let n=h.indexOf(Kh);if(n===-1)return h;let f=h.indexOf(v,n);if(f===-1)return h;let w=f+v.length;while(w<h.length&&(h[w]===`
`||h[w]==="\r"))w++;return h.slice(0,n)+h.slice(w)}function Qn(h){let n=h.indexOf(P),f=h.indexOf(G);if(n===-1&&f===-1)return{plan:h,middle:"",result:""};if(n===-1)return{plan:h.slice(0,f),middle:"",result:h.slice(f+G.length)};if(f===-1)return{plan:h.slice(0,n),middle:h.slice(n+P.length),result:""};return{plan:h.slice(0,n),middle:h.slice(n+P.length,f),result:h.slice(f+G.length)}}function Hn(h){let n=h.plan.trim(),f=h.middle.trim(),w=h.result.trim();if(!f&&!w)return n;let k=n;if(k+=`

${P}`,f)k+=`

${f}`;if(k+=`

${G}`,w)k+=`

${w}`;return k}class C{api;redactor;dryRun;reviewComment;artifactsBranchEnsured=!1;owner;repoName;constructor(h){this.api=h.api??new a({token:h.token}),this.redactor=h.redactor,this.dryRun=h.dryRun??!1,this.reviewComment=h.reviewComment??!1;let[n,f]=h.repo.split("/");if(!n||!f)throw Error(`Invalid repo string "${h.repo}", expected "owner/name"`);this.owner=n,this.repoName=f}commentUrl(h){return`https://github.com/${this.owner}/${this.repoName}/issues/comments/${h}`}issueUrl(h){return`https://github.com/${this.owner}/${this.repoName}/issues/${h}`}prUrl(h){return`https://github.com/${this.owner}/${this.repoName}/pull/${h}`}async getCommentBody(h){return(await(this.reviewComment?this.api.pulls:this.api.issues).getComment({owner:this.owner,repo:this.repoName,comment_id:h})).data.body??""}async updateCommentBody(h,n){let f=this.redactor?this.redactor.redact(n):n;if(this.dryRun){console.log(`[dry-run] would update comment #${h} (${this.commentUrl(h)}):
${f}`);return}await(this.reviewComment?this.api.pulls:this.api.issues).updateComment({owner:this.owner,repo:this.repoName,comment_id:h,body:f})}async createIssueComment(h,n){let f=this.redactor?this.redactor.redact(n):n;if(this.dryRun){console.log(`[dry-run] would create a github issue comment on issue #${h} (${this.issueUrl(h)}):
${f}`);return}await this.api.issues.createComment({owner:this.owner,repo:this.repoName,issue_number:h,body:f})}async updateZone(h,n,f){if(this.dryRun){let q=this.redactor?this.redactor.redact(f):f;console.log(`[dry-run] would update the ${n} zone of comment #${h} (${this.commentUrl(h)}):
${q}`);return}let w=await this.getCommentBody(h),k=Qn(w);k[n]=f,await this.updateCommentBody(h,Hn(k))}async clearSpinner(h){if(this.dryRun){console.log(`[dry-run] would clear the spinner on comment #${h} (${this.commentUrl(h)})`);return}let n=await this.getCommentBody(h),f=Kn(n);if(f===n)return;await this.updateCommentBody(h,f)}async getOpenPrForBranch(h){let f=(await this.api.pulls.list({owner:this.owner,repo:this.repoName,head:`${this.owner}:${h}`,state:"open",per_page:1})).data[0];if(!f)return null;return{number:f.number,url:f.html_url,body:f.body??"",baseRef:f.base.ref}}async getPrForBranch(h){let n=await this.api.pulls.list({owner:this.owner,repo:this.repoName,head:`${this.owner}:${h}`,state:"all",per_page:20}),f=(y)=>({number:y.number,url:y.html_url,body:y.body??"",baseRef:y.base.ref,state:y.state==="open"?"open":"closed",merged:y.merged_at!=null}),w=n.data.find((y)=>y.state==="open");if(w)return f(w);let k=n.data.find((y)=>y.merged_at!=null);if(k)return f(k);let q=n.data[0];return q?f(q):null}async findPrsReferencingIssue(h){let f=(await this.api.issues.listEventsForTimeline({owner:this.owner,repo:this.repoName,issue_number:h,per_page:X})).data,w=new Map;for(let k of f){if(k.event!=="cross-referenced")continue;let q=k.source?.issue;if(!q||!q.pull_request||typeof q.number!=="number")continue;w.set(q.number,{number:q.number,url:q.html_url??"",state:q.state??"",headRef:"",baseRef:"",isDraft:q.draft??!1,title:q.title??""})}return[...w.values()]}async updatePullRequestBody(h,n){let f=this.redactor?this.redactor.redact(n):n;if(this.dryRun){console.log(`[dry-run] would update PR #${h} body (${this.prUrl(h)}):
${f}`);return}await this.api.pulls.update({owner:this.owner,repo:this.repoName,pull_number:h,body:f})}async createDraftPr(h){let n=this.redactor?this.redactor.redact(h.body):h.body;if(this.dryRun)return console.log(`[dry-run] would open a DRAFT PR ${h.head} -> ${h.base} titled "${h.title}":
${n}`),{number:0,url:"(dry-run)",body:n,baseRef:h.base};let f=await this.api.pulls.create({owner:this.owner,repo:this.repoName,head:h.head,base:h.base,title:h.title,body:n,draft:!0});return{number:f.data.number,url:f.data.html_url,body:f.data.body??"",baseRef:f.data.base.ref}}async uploadArtifactImage(h,n,f){let w=`${h}/${encodeURIComponent(n)}`,k=`https://raw.githubusercontent.com/${this.owner}/${this.repoName}/${R}/${h}/${encodeURIComponent(n)}`;if(this.dryRun)return console.log(`[dry-run] would upload artifact image ${n} to branch ${R} at ${w}`),k;try{return await this.ensureArtifactsBranch(),(await this.api.repos.createOrUpdateFileContents({owner:this.owner,repo:this.repoName,path:w,message:`chore: add run artifact ${n} (run ${h})`,content:Buffer.from(f).toString("base64"),branch:R})).data.content?.download_url||k}catch(q){return console.error(`artifact image upload failed for ${n}:`,q),null}}async ensureArtifactsBranch(){if(this.artifactsBranchEnsured)return;if(await this.artifactsBranchExists()){this.artifactsBranchEnsured=!0;return}let h=await this.api.git.createCommit({owner:this.owner,repo:this.repoName,message:`chore: initialize ${R} branch for run artifacts`,tree:Zn});await this.api.git.createRef({owner:this.owner,repo:this.repoName,ref:`refs/heads/${R}`,sha:h.data.sha}),this.artifactsBranchEnsured=!0}async artifactsBranchExists(){try{return await this.api.git.getRef({owner:this.owner,repo:this.repoName,ref:`heads/${R}`}),!0}catch{return!1}}async createReview(h){if(this.dryRun){console.log(`[dry-run] would submit a ${h.event} review on #${h.pullNumber} with ${h.comments.length} inline comment(s)`);return}await this.api.pulls.createReview({owner:this.owner,repo:this.repoName,pull_number:h.pullNumber,event:h.event,body:h.body,comments:h.comments})}async getDefaultBranch(){return(await this.api.repos.get({owner:this.owner,repo:this.repoName})).data.default_branch}async getPullRequest(h){let n=await this.api.pulls.get({owner:this.owner,repo:this.repoName,pull_number:h});return{title:n.data.title,body:n.data.body??"",headRef:n.data.head.ref,headRepoFullName:n.data.head.repo?.full_name??"",baseRef:n.data.base.ref,state:n.data.merged_at?"merged":n.data.state==="open"?"open":"closed"}}async listIssueComments(h){let n=[],f=2;for(let w=1;w<=2;w++){let k=await this.api.issues.listComments({owner:this.owner,repo:this.repoName,issue_number:h,per_page:X,page:w});for(let q of k.data)n.push({id:q.id,author:q.user?.login??"unknown",body:q.body??"",createdAt:q.created_at});if(k.data.length<X)break}return n}async listReviewComments(h){let n=[],f=2;for(let w=1;w<=2;w++){let k=await this.api.pulls.listComments({owner:this.owner,repo:this.repoName,pull_number:h,per_page:X,page:w});for(let q of k.data)n.push({id:q.id,author:q.user?.login??"unknown",body:q.body??"",createdAt:q.created_at,inReplyToId:q.in_reply_to_id??0});if(k.data.length<X)break}return n}async getPrCheckRuns(h){try{let f=(await this.api.checks.listForRef({owner:this.owner,repo:this.repoName,ref:h})).data.check_runs;if(f.length===0)return"";let w=f.filter((y)=>y.conclusion==="failure"||y.conclusion==="timed_out"||y.conclusion==="action_required"),k=f.filter((y)=>y.status!=="completed"),q=[];for(let y of w){q.push(`- **${Zh(y.name)}**: ${y.conclusion}`);let W=y.output?.summary?.trim()||y.output?.text?.trim()||"";if(W){let Y=W.split(`
`).slice(0,Jn).join(`
`).slice(0,U);q.push("  ```"),q.push(Y),q.push("  ```")}}if(k.length>0)q.push(`- **${k.length} pending check(s)**: ${k.map((y)=>Zh(y.name)).join(", ")}`);if(q.length===0)return"";return`## CI Checks

${q.join(`
`)}`}catch(n){return console.warn(`[github] failed to fetch check runs for ref ${h}:`,n instanceof Error?n.message:n),""}}}var b=["GITHUB_TOKEN","OLLAMA_CLOUD_API_KEY","GROQ_API_KEY","LLAMACPP_API_KEY","OPENAI_API_KEY","CLOUDFLARE_API_KEY","COHERE_API_KEY","ANTHROPIC_API_KEY","DEEPSEEK_API_KEY","GOOGLE_API_KEY","MISTRAL_API_KEY","MINIMAX_API_KEY","MOONSHOT_API_KEY","NVIDIA_API_KEY","ZAI_API_KEY","OTEL_EXPORTER_OTLP_HEADERS","MEMORY_TOKEN","MEMORY_DEPLOY_KEY"],On=["-----BEGIN [A-Z ]*PRIVATE KEY( BLOCK)?-----[\\s\\S]+?-----END [A-Z ]*PRIVATE KEY( BLOCK)?-----"],zn=["github_pat_[A-Za-z0-9_]{82,}","gh[pours]_[A-Za-z0-9]{36,}","AIza[0-9A-Za-z_-]{35}","xox[bpoa]-[A-Za-z0-9-]{20,}","sk-[A-Za-z0-9_-]{20,}","eyJ[A-Za-z0-9_-]+\\.eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]{10,}"];var Dn=/[.*+?^${}()|[\]\\]/g;function g(h,n,f=8){let w=[],k=new Set;for(let q of n){let y=h[q];if(typeof y!=="string")continue;if(y.trim().length<f)continue;if(k.has(y))continue;k.add(y),w.push(y)}return w}function Hh(h){let n=new Set;for(let f of h){if(!f||n.has(f))continue;n.add(f),process.stdout.write(`::add-mask::${f}
`)}}function Oh(h={}){let n=h.placeholder??"***",f=h.minLength??8,w=h.env??process.env,k=h.heuristics??!1,q=g(w,b,f);q.sort((Y,J)=>J.length-Y.length);let y=q.map(Xn);if(y.push(...On),k)y.push(...zn);let W=y.length>0?new RegExp(y.join("|"),"g"):null;return{secretCount:q.length,redact(Y){if(!W||!Y)return Y;return Y.replace(W,n)}}}function Xn(h){return h.replace(Dn,"\\$&")}var M="/tmp/agent-output.txt",l="/tmp/infer-todos.json",d="/tmp/infer-cancelled",zh="/tmp/infer-gateway-version";function B(h){let n=process.env[h];if(!n)throw Error(`Missing required env var ${h}`);return n}function $(h){return process.env[h]??""}function Dh(){let h=$("INFER_DRY_RUN")==="true",n=h?$("GITHUB_TOKEN"):B("GITHUB_TOKEN"),f=B("INFER_REPO"),w=$("INFER_ENABLE_GIT_OPERATIONS")!=="false",k=$("INFER_REDACT_HEURISTICS")==="true",q=g(process.env,b);Hh(q);let y=Oh({env:process.env,heuristics:k}),W=$("INFER_COOKING_COMMENT_IS_REVIEW")==="true",Y=new C({token:n,repo:f,redactor:y,dryRun:h,reviewComment:W});return{dryRun:h,token:n,repo:f,enableGitOps:w,enableHeuristics:k,redactor:y,github:Y}}async function Xh(h,n,f){try{return await Yh(h,n)}catch(w){if(f.failHard)throw w;return console.warn(`[${f.stepName}] context read failed (${w.message}); proceeding with env-derived data`),uh(h)}}var Un=3000,Vn=300000,Ln=2000;async function jh(h,n,f={}){let w=f.readConfig?f.readConfig():Tn(h,n);if(!w)return"";let k=await Pn(w.url,f.fetcher??fetch,f.intervalMs,f.deadlineMs);if(k)return k;if(!w.run)return"";if(w.oci&&!w.standaloneBinary)return Nn(w.oci);return f.binaryVersion?f.binaryVersion():Sn()}function Fh(h){return h?`v${h}`:""}async function Pn(h,n=fetch,f=Un,w=Vn){let k=`${h.replace(/\/+$/,"")}/version`,q=Date.now()+w;for(;;){let y=await Gn(k,n);if(y)return y;if(Date.now()+f>=q)return"";await new Promise((W)=>setTimeout(W,f).unref())}}async function Gn(h,n){try{let f=await n(h,{signal:AbortSignal.timeout(Ln)});if(f.ok){let w=Bn(await f.text());if(w)return w}}catch{return null}return null}function Bn(h){return Mn(h)??i(h)}function Mn(h){try{let n=JSON.parse(h);if(n&&typeof n==="object"&&typeof n.version==="string")return i(n.version)}catch{return null}return null}function i(h){let n=h.trim().replace(/^v/,""),f=n[0]??"";if(n===""||n.length>32||f<"0"||f>"9")return"";return/^[0-9A-Za-z.+-]+$/.test(n)?n:""}function Nn(h){let n=h.slice(h.lastIndexOf("/")+1),f=n.indexOf(":");if(f>=0)n=n.slice(f+1);return i(n)}function Tn(h,n){try{let f=Rh(h,["config","get","gateway","--format","json"],{env:n,encoding:"utf8",timeout:15000,stdio:["ignore","pipe","pipe"]});if(f.status!==0)return null;return An(f.stdout??"")}catch{return null}}function An(h){let n=JSON.parse(h),f=typeof n.url==="string"?n.url:"";if(!f)return null;return{url:f,run:n.run!==!1,oci:typeof n.oci==="string"?n.oci:"",standaloneBinary:n.standalone_binary===!0}}function In(h=jn()){let n=process.platform==="win32"?"inference-gateway.exe":"inference-gateway";return Fn(h,".infer","bin",n)}function Sn(h=Rh,n=In()){try{let f=h(n,["--version"],{encoding:"utf8",timeout:5000,stdio:["ignore","pipe","pipe"]}),w=(f.stdout??"").trim().split(/\s+/).filter(Boolean);if(f.status!==0)return"";return i(w[w.length-1]??"")}catch{return""}}function Uh(h){try{Rn(zh,h)}catch(n){console.error("[gateway] failed to persist gateway version:",n)}}function Vh(h,n){return{model:n,actionVersion:h.INFER_ACTION_VERSION??"",cliVersion:h.INFER_CLI_VERSION??"",gatewayVersion:"",workflowUrl:h.INFER_WORKFLOW_URL??""}}function Lh(h){return[`**Model:** \`${h.model}\``,h.actionVersion?`**Action:** ${an(h.actionVersion)}`:"",h.cliVersion?`**CLI:** \`${h.cliVersion}\``:"",h.gatewayVersion?`**Gateway:** \`${h.gatewayVersion}\``:"",h.workflowUrl?`[View Job](${h.workflowUrl})`:""].filter(Boolean).join(" \xB7 ")}function an(h){let n=/^[0-9a-f]{40}$/.test(h)?`https://github.com/inference-gateway/infer-action/commit/${h}`:`https://github.com/inference-gateway/infer-action/releases/tag/${h}`;return`[\`${h}\`](${n})`}var Ph=(h)=>/^(true|1)$/i.test((h??"").trim());function Gh(h){let n=(h.INFER_MIRROR_AGENT_LOGS??"").trim();return{stdout:n!==""?Ph(n):Ph(h.INFER_LOGGING_DEBUG),stderr:!0}}import _n from"readline";async function*Mh(h){let n=_n.createInterface({input:h,crlfDelay:1/0}),f=null;for await(let w of n){if(f){if(f.push(w),w==="}"){let y=Bh(f.join(`
`));if(f=null,y)yield y}continue}let k=w.trim();if(!k)continue;if(k==="{"){f=[k];continue}if(k[0]!=="{")continue;let q=Bh(k);if(q)yield q}}function Bh(h){try{let n=JSON.parse(h);if(typeof n!=="object"||n===null)return null;let{role:f,type:w}=n;if(typeof f==="string"||w==="session_stats"||w==="compaction_started"||w==="compaction_completed")return n;return null}catch{return null}}var ih={SYSTEM_DIRECT:`# Infer Agent (manual run)

You are running in CI from a manual dispatch. There is no GitHub issue
or pull request thread - your task is the free-text prompt below, and
your result is captured in the workflow job summary. The runner
filesystem is ephemeral - any change you do not commit and push to a
remote branch is lost when the job ends.

## Working style

Track your plan with TodoWrite and update it as you go. There is no
issue/PR comment to mirror to - your progress shows in the job log and
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
   and fix failures before each commit - CI runs only AFTER this job
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

1. \`git status\` - clean tree, commit and push anything left.
2. \`git status -sb\` - no "[ahead", if shown \`git push\`.
3. \`gh pr view\` - succeeds, if not create the draft PR now (step 3).

Question-only runs skip this.

## Output

Your final message is the ONLY thing posted to the workflow job summary -
nothing you write before it is ever shown, so never defer to an earlier
message. If you changed code, end with a short summary. If you were asked
to analyze or report, put the COMPLETE output in this final message. Do
not call any GitHub APIs to report.

## Environment

- \`gh\` is authenticated via GITHUB_TOKEN, \`git\` is configured as
  github-actions[bot] with full file access to the checkout.
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
person. For ordinary numbering write "step 1" or "PR 96" so you never
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
   each commit - CI runs only AFTER this job ends. Do not batch commits:
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
   keep pushing to it - do NOT run \`gh pr create\` again.

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

1. \`git status\` - clean tree, commit and push anything left.
2. \`git status -sb\` - no "[ahead", if shown \`git push\`.
3. \`gh pr view\` - succeeds, if not create the draft PR now (step 3).

Question-only runs skip this.

## Output

Your final message is the ONLY thing posted to the issue - nothing you
write before it is ever shown to anyone, so never defer to an earlier
message. If you changed code, end with a short summary of what you changed.
If you only answered a question, put the COMPLETE answer in this final
message. Do not call any GitHub comment APIs - the runner posts your
result.

## Environment

- \`gh\` is authenticated via GITHUB_TOKEN, \`git\` is configured as
  github-actions[bot] with full file access to the checkout.
- The runner is ephemeral - unpushed commits are lost when the job ends.`,SYSTEM_PR_FORK:`# GitHub PR Agent (view-only)

You are running in CI on PR #{{prNumber}}. The PR's head branch
\`{{headRef}}\` lives in a fork (\`{{headRepoFullName}}\`) and has been
fetched read-only for you to inspect.

## Working style

Track your plan with TodoWrite and update it as you go - the runner
mirrors your todos to the PR comment.

Todos render as Markdown there: \`#123\` links issue/PR 123 and \`@name\`
pings a real user. Write them only when you mean that exact issue, PR, or
person. For ordinary numbering write "step 1" or "PR 96" so you never
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
person. For ordinary numbering write "step 1" or "PR 96" so you never
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
and report - put every proposed change as a description or a fenced diff in
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
   whatever it provides - and fix failures before each commit - CI runs
   only AFTER this job ends. Do not batch commits: the job has a turn
   limit, and deferred work is destroyed when the runner ends.

3. The pull request ALREADY EXISTS (PR #{{prNumber}}). DO NOT run
   \`gh pr create\`. DO NOT run \`gh pr merge\`, \`gh pr close\`, or
   \`gh pr review\`. You MAY update this PR's title and description with
   \`gh pr edit {{prNumber}} --title ... --body ...\` when the task calls
   for it. Your pushes to \`{{headRef}}\` update the PR automatically. Low
   on turns or context? Stop starting new work and make sure everything
   is committed and pushed - your pushes are the PR.

   Asked to resolve a review thread? Only after your fix is pushed, and
   only threads you were asked to resolve and actually addressed. Find
   the thread id (\`PRRT_...\`), then resolve it with exactly:

       gh api graphql -f query='query{repository(owner:"<owner>",name:"<repo>"){pullRequest(number:{{prNumber}}){reviewThreads(first:100){nodes{id isResolved comments(first:1){nodes{body}}}}}}}'
       gh api graphql -f query='mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{isResolved}}}' -f id=<PRRT_...>

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

- \`gh\` is authenticated via GITHUB_TOKEN, \`git\` is configured as
  github-actions[bot] with full file access, already on the PR head branch.
- The runner is ephemeral - unpushed commits are lost when the job ends.`,TASK_DIRECT:`Complete the following task in this repository. It was dispatched manually - there is no associated GitHub issue or pull request to reply to.

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

{{ciChecksSection}}

Run \`git diff origin/{{baseRef}}...HEAD\` for the full diff and \`git log origin/{{baseRef}}..HEAD\` for the commit history.{{triggerSection}}`};function En(h){let n=process.env[`INFER_PROMPT_OVERRIDE_${h}`];return n&&n.trim()?n:ih[h]}function vn(h){let n=process.env[`INFER_PROMPT_OVERRIDE_${h}`];return n&&n.trim()?n:null}var Nh=["git commit","git push","gh pr create","gh pr ready","git status"],Cn=["git commit","git push","git status"],bn=["git commit","git push"],gn={SYSTEM_ISSUE:Nh,SYSTEM_DIRECT:Nh,SYSTEM_PR:Cn,SYSTEM_PR_FORK:bn};function ln(h){if(h.kind==="issue")return"SYSTEM_ISSUE";if(h.kind==="direct")return"SYSTEM_DIRECT";if(h.isFork)return"SYSTEM_PR_FORK";return"SYSTEM_PR"}function Th(h){let n=ln(h),f=vn(n);if(f===null)return[];let w=gn[n];if(!w||w.length===0)return[];let k=w.filter((q)=>!f.includes(q));return k.length>0?[{key:n,missing:k}]:[]}function O(h,n={}){return En(h).replace(/\{\{(\w+)\}\}/g,(f,w)=>{if(!(w in n))throw Error(`Missing variable "${w}" for prompt "${h}"`);return String(n[w])})}function Ah(h,n={}){if(h.kind==="issue")return cn(h);if(h.kind==="direct")return mn(h);return tn(h,n.diffStat??"",n.ciChecksSection??"")}var dn=`## A2A Agents

Delegated A2A tasks run in the background and you are notified automatically when they complete. Submit each task exactly once with A2A_SubmitTask, then WAIT for the completion notification - never resubmit the same task or poll for it in a loop. Only retry a submission if the submission call itself failed (e.g. the agent container was still starting).`,sn='## Images in the conversation\n\nIssue/PR text may embed images (`![...](url)` or `<img src="...">`) - screenshots, error dialogs, diagrams. These often carry the crux of the request, so read them BEFORE starting work: download each with WebFetch (`download=true`), then run ImageDecode on the saved file path, passing a `prompt` asking for what you need (e.g. the exact error text, the UI elements shown). If a download fails (private-repo attachments may be inaccessible), say so in your final response and continue with the text.',rn='## Inline review mode\n\nWhen review-inline is enabled, the runner submits your review as a real GitHub\npull request review with inline, line-anchored comments. ALWAYS end your final\nmessage with a fenced JSON block carrying your verdict and structured findings,\neven when there are no findings:\n\n````json:findings\n{\n  "verdict": "comment",\n  "findings": [\n    {\n      "path": "src/parser.ts",\n      "line": 42,\n      "side": "RIGHT",\n      "start_line": 40,\n      "body": "Off-by-one on the loop bound.\\n\\n```suggestion\\nfor (let i = 0; i < n; i++) {\\n```"\n    }\n  ]\n}\n````\n\nSet `"verdict": "approve"` only when the PR is ready to merge as-is and\n`findings` is empty; otherwise use `"comment"`. An approve verdict is\nsubmitted as an approval (or as a comment review on a PR you opened yourself).\n\nEach finding must reference a file and line that exists in the PR diff.\nUse `side: "RIGHT"` for new code, `"LEFT"` for the base. For multi-line\ncomments include `start_line` and `start_side`. The `body` can carry\n```suggestion blocks the PR author can apply with one click. The runner\nstrips this block from the summary comment, so your prose above it is still\nvisible there.';function Ih(h,n){let f=xn(h);if(process.env.INFER_A2A_ENABLED==="true")f=`${f}

${dn}`;if(process.env.INFER_VISION_ANNOTATOR_ENABLED==="true")f=`${f}

${sn}`;if(h.kind==="pull_request"&&process.env.INFER_REVIEW_MODE==="true"&&process.env.INFER_REVIEW_INLINE==="true")f=`${f}

${rn}`;if(n.trim())return`${f}

## Additional Instructions

${n}`;return f}function xn(h){if(h.kind==="issue")return O("SYSTEM_ISSUE",{issueNumber:h.issueNumber});if(h.kind==="direct")return O("SYSTEM_DIRECT");if(h.isFork)return O("SYSTEM_PR_FORK",{prNumber:h.prNumber,headRef:h.headRef,headRepoFullName:h.headRepoFullName,baseRef:h.baseRef});return O("SYSTEM_PR",{prNumber:h.prNumber,headRef:h.headRef,baseRef:h.baseRef})}function mn(h){return O("TASK_DIRECT",{prompt:h.prompt})}function cn(h){let n=h.triggeringComment?`

## Triggering comment from @${h.triggeringComment.author}

${h.triggeringComment.body}

Treat this comment as the user's most recent intent. If it asks for something more specific than the issue body, prioritise it.`:"";return O("TASK_ISSUE",{issueNumber:h.issueNumber,issueTitle:h.issueTitle,issueBody:h.issueBody,existingWorkSection:pn(h),recentCommentsSection:Sh((h.threadComments??[]).filter((f)=>!f.isTrigger),"Recent comments (chronological)"),triggeringCommentSection:n})}function Sh(h,n){let f=h.filter((y)=>!y.author.endsWith("[bot]")),w=f.slice(-3);if(w.length===0)return"";let k=f.length-w.length,q=k>0?`_\u2026${k} earlier comment${k===1?"":"s"} omitted_

`:"";return`

## ${n}

${q}${w.map(ah).join(`

`)}`}function pn(h){let n=h.associatedPrs??[],f=h.associatedBranches??[];if(n.length===0&&f.length===0)return"";let w=["## Existing work for this issue","A prior run or another contributor may already have started on this issue. Before creating a branch, inspect the items below and CONTINUE from them if they contain relevant work - check it out (`gh pr checkout <number>`, or `git fetch origin <branch> && git checkout <branch>`) and build on top of it rather than starting fresh. Only start a new branch if none of these apply."];if(n.length){let k=n.map((q)=>{let y=q.isDraft?" (draft)":"",W=q.state&&q.state!=="open"?` [${q.state}]`:"",Y=q.headRef?` - branch \`${q.headRef}\``:"",J=q.title?` - ${q.title}`:"";return`- PR #${q.number}${y}${W}${Y}: ${q.url}${J}`});w.push(`### Pull requests

`+k.join(`
`))}if(f.length)w.push(`### Branches

`+f.map((k)=>`- \`${k}\``).join(`
`));return`

`+w.join(`

`)}function tn(h,n,f){let w=h.isFork?`
Head lives in a fork: ${h.headRepoFullName}. You CANNOT push commits to it from this runner.`:"";if(h.prState!=="open")w+=`
This PR is already ${h.prState}. Its head branch may have been deleted, and the checkout is likely on the default branch. Treat the request as follow-up work: if it needs no code changes (e.g. filing a follow-up issue), just do that; if it needs code changes, create a NEW branch off ${h.baseRef} and open a new PR - never push to the old head branch.`;let k=h.comments.find((Q)=>Q.isTrigger),q=k?`

## Triggering comment from @${k.author} (id: ${k.id})

${k.body}

This is the user's most recent ask. Address it directly. Do not re-implement existing changes unless this comment asks for that.`:"",y=h.comments.filter((Q)=>!Q.isTrigger);if(h.reviewComment)return en(h,h.reviewComment,{forkNotice:w,triggerSection:q,others:y});let W=Sh(y,"Other comments (chronological)"),Y=h.prBody.trim()?h.prBody:"_(no description)_",J=n.trim()?"```\n"+n.trim()+"\n```":"_(no changes on this branch yet)_";return O("TASK_PR",{prNumber:h.prNumber,prTitle:h.prTitle,headRef:h.headRef,baseRef:h.baseRef,forkNotice:w,prBody:Y,triggerSection:q,otherCommentsSection:W,diffStatSection:J,ciChecksSection:f})}function en(h,n,f){let w=n.startLine&&n.line&&n.startLine!==n.line?`, lines ${n.startLine}-${n.line}`:n.line?`, line ${n.line}`:"",k=f.others.length>0?`

## Earlier comments in this review thread

${f.others.map(ah).join(`

`)}`:"";return O("TASK_PR_REVIEW",{prNumber:h.prNumber,prTitle:h.prTitle,headRef:h.headRef,baseRef:h.baseRef,forkNotice:f.forkNotice,filePath:n.path,lineInfo:w,diffHunk:n.diffHunk,threadSection:k,triggerSection:f.triggerSection})}function ah(h){return`**@${h.author}** \xB7 ${h.createdAt}

${h.body}`}function hf(h){if(!Number.isFinite(h)||h<=0)return 10;return Math.max(10,Math.round(h*0.1))}function nf(h){return Math.max(1,Math.floor(h*0.8))}function ff(h){if(h.kind==="direct")return h.prompt;if(h.kind==="issue")return h.triggeringComment?.body??`${h.issueTitle}
${h.issueBody}`;return h.comments.find((n)=>n.isTrigger)?.body??`${h.prTitle}
${h.prBody}`}function Eh(h){return/\bdemo(s|nstrat\w*)?\b/i.test(ff(h))}function wf(h,n){let f=[],w=n.enableGitOps&&!(h.kind==="pull_request"&&h.isFork);if(f.push({name:"infer-action-context",hook:"pre_stream",trigger:"interval",interval:5,text:n.enableGitOps?kf(h):"<system-reminder>Keep your TodoWrite plan current as you go. Only answering a question? Ignore this.</system-reminder>"}),w){if(f.push({name:"infer-action-wrap-up",hook:"pre_stream",trigger:"turns_before_max",threshold:hf(n.maxTurns??0),text:_h(h)}),n.maxDurationMinutes&&n.maxDurationMinutes>0)f.push({name:"infer-action-wrap-up-time",hook:"pre_stream",trigger:"elapsed_minutes",threshold:nf(n.maxDurationMinutes),text:_h(h,"time budget")});f.push({name:"infer-action-failed-tool",hook:"post_tool",trigger:"on_failure",text:yf()})}if(n.recordDemo)f.push({name:"infer-action-record-demo",hook:"pre_stream",trigger:"once",text:qf()});return f}function kf(h){if(h.kind==="pull_request"&&h.isFork)return"<system-reminder>This PR is from a fork - you CANNOT commit or push. Investigate with file reads and git diff, then answer the user's question or summarise. Keep your TodoWrite plan current.</system-reminder>";if(h.kind==="pull_request")return`<system-reminder>Keep your TodoWrite plan current. If you changed files, commit + push after each step so PR #${h.prNumber} stays current - unpushed work is lost when the job ends. Only reviewing or answering? Do not change, commit, or push anything.</system-reminder>`;return"<system-reminder>Keep your TodoWrite plan current. Changing code? Work on a pushed branch with an open draft PR (`gh pr create --draft`) and commit + push after each step so nothing is lost - never commit on or push to main. Only answering a question? Ignore this.</system-reminder>"}function _h(h,n="turn limit"){let f=h.kind==="pull_request"?`so PR #${h.prNumber} is up to date, and update the PR body with a checklist of the remaining todos`:"and make sure the draft PR exists: `gh pr create --draft` with a title like `wip: <short description of the task>` and a body listing the remaining todos and unfinished work, so a human can pick up where you left off";return`<system-reminder>You are close to the ${n}. Stop starting new work - if you have uncommitted or unpushed changes, commit and push them now ${f}. If the repo's checks fail on commit and you cannot fix them before the ${n}, commit with --no-verify as a last resort rather than losing the work. Unpushed work is lost when the run ends. If you changed nothing, just finish your summary.</system-reminder>`}function qf(){return'<system-reminder>The user asked for a demo: load the `demo` skill now and follow it.\nAdd "Record the demo" as your last todo - the recording comes after the work is committed and\npushed, and ends as one GIF where the skill says.</system-reminder>'}function yf(){return"<system-reminder>That tool call FAILED - the change did NOT happen. Re-read or re-check, fix it, and retry. Never mark a todo done or claim success on a failed call.</system-reminder>"}function Wf(h){let n=["enabled: true","merge: true","reminders:"];for(let f of h){if(n.push(`  - name: ${JSON.stringify(f.name)}`),n.push(`    hook: ${JSON.stringify(f.hook)}`),n.push(`    trigger: ${JSON.stringify(f.trigger)}`),f.interval!==void 0)n.push(`    interval: ${f.interval}`);if(f.threshold!==void 0)n.push(`    threshold: ${f.threshold}`);n.push(`    text: ${JSON.stringify(f.text)}`)}return n.join(`
`)+`
`}function vh(h,n,f){let w=wf(n,f),k=h.trim();if(!k)return Wf(w);return Yf(k,w)}function Yf(h,n){let f=uf(h);if(!f)return`${h}
`;let w=f.reminders??[],k=new Set(w.map((y)=>y.name)),q=[...w,...n.filter((y)=>!k.has(y.name))];return`${JSON.stringify({...f,reminders:q})}
`}function uf(h){let n;try{n=Bun.YAML.parse(h)}catch{return}if(typeof n!=="object"||n===null||Array.isArray(n))return;let f=n.reminders;if(f!=null&&!Array.isArray(f))return;return n}import{execFileSync as $f}from"child_process";import{appendFileSync as Ch,existsSync as Xw,readFileSync as of,rmSync as Jf,writeFileSync as Zf}from"fs";var Kf=60000;function bh(){try{Zf(d,"1")}catch(h){console.error("[runner] failed to write cancel marker:",h)}}function gh(){try{Jf(d,{force:!0})}catch{return}}var s=2,lh=3;function dh(h,n=r){try{return n(`git diff --stat origin/${Qf(h)}...HEAD`)}catch(f){return console.error("[runner] git diff --stat failed:",f),""}}function sh(h,n=(f)=>f){try{let k=of(M,"utf8").split(`
`).filter((q)=>q.trim()!=="").slice(-h);if(k.length===0)return;console.error("=========================================="),console.error(`[recover] last ${k.length} line(s) of agent activity before it stopped:`),console.error("------------------------------------------");for(let q of k){let y=q.length>U?q.slice(0,U)+" \u2026":q;console.error(n(y))}console.error("==========================================")}catch(f){console.error("[recover] could not read agent transcript for breadcrumb:",f)}}function r(h){return $f("bash",["-c",h],{encoding:"utf8",timeout:Kf,env:{...process.env,GIT_TERMINAL_PROMPT:"0"}})}function Qf(h){return`'${h.replace(/'/g,"'\\''")}'`}function j(h,n){let f=process.env.GITHUB_OUTPUT;if(!f){console.log(`(would set output) ${h}=${n}`);return}if(n.includes(`
`)){let w=`_GHO_EOF_${Math.random().toString(36).slice(2)}`;Ch(f,`${h}<<${w}
${n}
${w}
`)}else Ch(f,`${h}=${n}
`)}class x{handlers=new Map;flushers=[];listeners=[];on(h,n){return this.handlers.set(h,n),this}onMessage(h){return this.listeners.push(h),this}addFlusher(h){return this.flushers.push(h),this}async observe(h){for await(let n of h){for(let k of this.listeners)try{k(n)}catch(q){console.error("[ticker] message listener threw:",q)}if(!_(n))continue;let f=E(n.content);if(!f?.tool_name)continue;let w=this.handlers.get(f.tool_name);if(!w)continue;try{await w(f,n)}catch(k){console.error(`[ticker] handler for ${f.tool_name} threw:`,k)}}}async flush(){for(let h of this.flushers)try{await h()}catch(n){console.error("[ticker] flusher threw:",n)}}}function rh(h,n){let f=null,w=null,k=null,q=async()=>{if(w=null,!f)return;let y=f.value;f=null,k=h(y).catch((W)=>{console.error("[throttle] fn threw:",W)}).finally(()=>{k=null}),await k};return{call(y){if(f={value:y},!w)w=setTimeout(()=>{q()},n)},async flush(){if(w)clearTimeout(w),w=null;if(f)await q();else if(k)await k}}}function xh(h){let n=Math.floor(h/1000);if(n<60)return`${n}s`;let f=Math.floor(n/60),w=n%60;if(f<60)return`${f}m ${w}s`;let k=Math.floor(f/60),q=f%60;return`${k}h ${q}m ${w}s`}var Xf=1500,Rf=130,jf=2000;async function Ff(){let{dryRun:h,enableGitOps:n,redactor:f,github:w}=Dh(),k=$("INFER_REVIEW_MODE")==="true",q=n&&!k,y=$("INFER_COOKING_COMMENT_ID"),W=y?Number.parseInt(y,10):0,Y=Number.isFinite(W)&&W>0,J=B("INFER_AGENT_MODEL"),Q=Vh(process.env,J),z=$("INFER_CUSTOM_INSTRUCTIONS"),ch=$("INFER_BASH_ALLOW_APPEND"),m=$("INFER_LOGGING_DEBUG")==="true",N=Gh(process.env),Z=await Xh(process.env,w,{stepName:"dry-run",failHard:!h});if(Z.kind==="pull_request"&&(n||k))try{Mf(Z)}catch(u){if(!h)throw u;console.warn("[dry-run] PR head checkout failed; continuing on the current branch:",u instanceof Error?u.message:u)}let ph=Z.kind==="pull_request"?dh(Z.baseRef):"",th=Z.kind==="pull_request"?await w.getPrCheckRuns(Z.headRef):"",c=Ih(Z,z),p=Ah(Z,{diffStat:ph,ciChecksSection:th});if(q)for(let u of Th(Z)){let o=u.key.replace(/^SYSTEM_/,"").toLowerCase().replace(/_/g,"-");process.stdout.write(`::warning::INFER_PROMPT_OVERRIDE_${u.key} replaces the bundled system prompt (system-prompt-${o} / src/prompts/system-${o}.md) and is missing the git-safety markers: ${u.missing.join(", ")}. The default guards against lost work (branch-first, commit-per-todo, push, draft PR, finish checklist); your override dropped those instructions, so the agent may leave changes uncommitted or unpushed. Re-add them to your override, or use the custom-instructions input to layer extras on top of the default instead of replacing it.
`)}let eh=$("INFER_REMINDERS_CONFIG"),T=$("INFER_COMPUTER_USE_RECORDING_ENABLED")==="true"&&Eh(Z),t=vh(eh,Z,{enableGitOps:q,maxTurns:Number.parseInt($("INFER_AGENT_MAX_TURNS"),10)||0,recordDemo:T,maxDurationMinutes:Number.parseInt($("INFER_AGENT_MAX_DURATION_MINUTES"),10)||0}),e=Wh(q,ch,T),V=$("INFER_BIN")||"infer",hn=$("INFER_NO_COLOR")==="true",A=Vf(process.env,{systemPrompt:c,bashAllowAppend:e,remindersYaml:t,reviewMode:k,recordDemo:T});console.log("=========================================="),console.log("SYSTEM PROMPT:"),console.log("==========================================");let hh=$("INFER_BIN")?void 0:Lf(V,A);if(console.log(hh===void 0?c:Pf(hh,m)),console.log("=========================================="),console.log(""),console.log("Running agent with task:"),console.log(p),console.log("---"),h)console.log("=========================================="),console.log("DRY RUN - the agent would be invoked with:"),console.log("=========================================="),console.log(`Model:        ${J}`),console.log(`Context kind: ${Z.kind}`),console.log(`Git ops:      ${n?"enabled":"disabled"}`),console.log(`Review mode:  ${k?"enabled (Edit/Write/Delete disabled)":"disabled"}`),console.log(`INFER_BIN:    ${V}`),console.log("--- REMINDERS (INFER_REMINDERS_CONFIG) ---"),console.log(t),console.log("--- BASH ALLOW-LIST APPEND (added to the CLI read-only baseline) ---"),console.log(e||"(none - CLI read-only baseline only)"),console.log("==========================================");If(),gh();let nn=Date.now(),nh=["headless","--format","json-pretty","-m",J,p];if(hn)nh.push("--no-colors");let K=Hf(V,nh,{stdio:["inherit","pipe","pipe"],env:A});if(!K.stdout||!K.stderr)throw Error("child stdio not piped - this should not happen");let fh=!1,wh=!1,kh=(u)=>{if(wh)return;wh=!0,fh=!0,bh(),console.error(`[runner] received ${u}; stopping the agent so the salvage step can recover its work`);try{K.kill("SIGKILL")}catch(o){console.error("[runner] failed to stop agent child:",o)}};process.once("SIGTERM",()=>kh("SIGTERM")),process.once("SIGINT",()=>kh("SIGINT"));let L=zf(M),qh=new Df;if(K.stdout.pipe(L,{end:!1}),N.stdout)K.stdout.pipe(process.stdout,{end:!1});else console.log("[runner] agent stdout muted (set mirror-agent-logs: true or debug: true to mirror); stderr still shown, full transcript written to /tmp/agent-output.txt");K.stdout.pipe(qh),K.stdout.on("end",()=>L.end()),K.stderr.on("data",(u)=>{if(L.write(u),N.stderr)process.stderr.write(u)});let F=new x,yh=[],D=Y?rh(async(u)=>{let o=Gf(u,Q);try{await w.updateZone(W,"plan",o),console.log(`[ticker] updated plan section (${u.length} todos)`)}catch(fn){console.error("[ticker] PATCH failed:",fn)}},Xf):null;if(D)F.addFlusher(D.flush),D.call([]);else console.log("[ticker] no cooking comment; plan mirroring disabled (direct mode)");if(F.on("TodoWrite",(u)=>{let o=u.data?.todos;if(!Array.isArray(o))return;if(Af(o),yh=o,D)D.call(o)}),Uf(Q,V,A,()=>{if(D)D.call(yh)}),m)F.onMessage((u)=>{if(Jh(u)){console.log(u.type==="compaction_started"?"[agent] context compaction started (summarising older turns)\u2026":"[agent] context compaction completed");return}let o=u;if(o.role==="user"&&o.hidden===!0&&o.kind==="system_reminder")console.log("[agent] system reminder injected")});await F.observe(Mh(qh)),await F.flush();let H=await Nf(K),I=Date.now()-nn;if(console.log(""),console.log("=========================================="),console.log(`Agent exited with code ${H}`),console.log(`Duration: ${xh(I)}`),console.log("=========================================="),fh){if(j("run-duration-ms",String(I)),await Tf(L),N.stdout)sh(40,f.redact);return console.error("[runner] cancelled mid-run; the salvage step will recover any work and report the timeout"),Rf}if(j("exit-code",String(H)),j("run-duration-ms",String(I)),H===s||H===lh){let u=H===s?"turn limit":"time budget";return j("result",`Agent stopped early (reached the ${u})`),console.error(`[runner] agent reached the ${u}; the salvage step will recover any unpushed work and the report renders a stopped-early status`),0}return j("result",H===0?"Agent completed successfully":`Agent failed with exit code ${H}`),H}function Uf(h,n,f,w){if($("INFER_BIN"))return;jh(n,f).then((k)=>{if(!k)return;console.log(`[runner] gateway version: ${k}`),h.gatewayVersion=Fh(k),Uh(h.gatewayVersion),w()}).catch((k)=>console.error("[runner] gateway version probe failed:",k))}function Vf(h,n){return{...h,INFER_PROMPTS_AGENT_SYSTEM_PROMPT:n.systemPrompt,INFER_AGENT_SYSTEM_PROMPT_WITH_DEFAULTS:"true",INFER_TOOLS_BASH_ALLOW_APPEND:n.bashAllowAppend,INFER_REMINDERS_CONFIG:n.remindersYaml,INFER_REVIEW_INLINE:h.INFER_REVIEW_INLINE??"",INFER_COMPUTER_USE_RECORDING_ENABLED:String(n.recordDemo),...n.reviewMode?{INFER_TOOLS_EDIT_ENABLED:"false",INFER_TOOLS_WRITE_ENABLED:"false",INFER_TOOLS_DELETE_ENABLED:"false"}:{},OTEL_EXPORTER_OTLP_ENDPOINT:h.OTEL_EXPORTER_OTLP_ENDPOINT??"",OTEL_EXPORTER_OTLP_HEADERS:h.OTEL_EXPORTER_OTLP_HEADERS??"",OTEL_SERVICE_NAME:h.OTEL_SERVICE_NAME??"infer-action",OTEL_RESOURCE_ATTRIBUTES:h.OTEL_RESOURCE_ATTRIBUTES??""}}function Lf(h,n){try{let f=Of(h,["debug","agent","system_prompt"],{env:n,encoding:"utf8",timeout:30000});if(f.status!==0||!f.stdout?.trim())return;return f.stdout}catch{return}}function Pf(h,n){if(n)return h;let f=h.indexOf("PERSISTENT MEMORY INDEX");if(f===-1)return h;let w=h.slice(f),k=w.indexOf(`

Current date:`),q=k===-1?"":w.slice(k);return`${h.slice(0,f)}PERSISTENT MEMORY INDEX: [redacted - set debug: true to include memory entries]${q}`}function Gf(h,n){let f=`${Qh}

${Lh(n)}`;if(h.length===0)return`${f}

### Todos

_(agent has not posted a plan yet)_`;let w=h.map((k)=>{return`- ${k.status==="completed"?"[x]":k.status==="in_progress"?"[~]":"[ ]"} ${k.content}`});return[f,"","### Todos","",...w].join(`
`)}function Bf(h){let n=h.stderr;return((typeof n==="string"?n:"")+String(h.message)).includes("couldn't find remote ref")}function Mf(h,n=r){try{if(h.isFork){let f=`pr-${h.prNumber}`;console.log(`[runner] fork PR; fetching pull/${h.prNumber}/head into ${f}`),n(`git fetch origin pull/${h.prNumber}/head:${f}`),n(`git checkout ${f}`)}else{console.log(`[runner] checking out PR head branch ${h.headRef}`);try{n(`git fetch origin ${h.headRef}`)}catch(f){if(!Bf(f))throw f;process.stdout.write(`::warning::PR head branch ${h.headRef} no longer exists on origin (likely deleted when the PR was closed or merged); recreating it from pull/${h.prNumber}/head. If the PR is closed or merged, pushing will not reopen it.
`),n(`git fetch origin pull/${h.prNumber}/head:${h.headRef}`)}n(`git checkout ${h.headRef}`)}}catch(f){throw Error(`Failed to check out PR head (${h.headRef}). Aborting before spawning the agent so it doesn't run against the wrong branch.`,{cause:f})}}async function Nf(h){if(h.exitCode!==null)return h.exitCode;return new Promise((n)=>{h.on("close",(f)=>n(f??0))})}async function Tf(h){if(h.writableFinished)return;await Promise.race([new Promise((n)=>h.once("finish",n)),new Promise((n)=>setTimeout(n,jf).unref())])}function Af(h){try{mh(l,JSON.stringify(h))}catch(n){console.error("[runner] failed to persist todos:",n)}}function If(){try{mh(l,"[]")}catch{return}}if(import.meta.main)Ff().then((h)=>process.exit(h),(h)=>{console.error("[runner] uncaught error:",h),process.exit(1)});export{Lf as resolveMergedSystemPrompt,Gf as renderPlan,Pf as redactMemoryIndex,Mf as ensurePrHeadCheckedOut,Vf as buildChildEnv};
