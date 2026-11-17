#!/usr/bin/env bun
// @bun
import{spawn as Qf,spawnSync as Hf}from"child_process";import{createWriteStream as zf,writeFileSync as xh}from"fs";import{PassThrough as Df}from"stream";var wn=["git add( .*)?","git commit( .*)?","git push( .*)?","git checkout( .*)?","git switch( .*)?","git fetch( .*)?","git restore( .*)?","git reset( .*)?","git stash( .*)?","gh pr create( .*)?","gh pr ready( .*)?","gh pr edit( [0-9]+)? --(title|body|body-file)( .*)?",String.raw`gh api graphql -f query='query ?[({][^']*'( --jq '[^']*')?`,String.raw`gh api graphql -f query='mutation\(\$id:ID!\)\{resolveReviewThread\(input:\{threadId:\$id\}\)\{thread\{isResolved\}\}\}' -f id=PRRT_[A-Za-z0-9_-]+`],on=["tmux (send-keys|capture-pane)( .*)?","ffmpeg( .*)?"];function oh(h,n,f=!1){return[...h?wn:[],...f?on:[],n.trim()].filter(Boolean).join(",")}import{spawnSync as ih}from"child_process";import{readFileSync as xf,writeFileSync as Xn}from"fs";import{homedir as Rn}from"os";import{join as Fn}from"path";async function uh(h,n){let f=h.INFER_CONTEXT_KIND;if(!f)throw Error("Missing required env var INFER_CONTEXT_KIND");if(f==="issue")return kn(h,n);if(f==="pull_request")return Wn(h,n);if(f==="direct")return un(h);throw Error(`Unknown INFER_CONTEXT_KIND "${f}" (expected "issue", "pull_request", or "direct")`)}function kh(h){let n=h.INFER_CONTEXT_KIND;if(n==="direct")return{kind:"direct",prompt:(h.INFER_DIRECT_PROMPT??"").trim()||"(dry-run: no prompt)"};if(n==="pull_request"){let f=yh(h),w=f?A(h):void 0;return{kind:"pull_request",prNumber:Number.parseInt(h.INFER_ISSUE_NUMBER??"0",10)||0,prTitle:"(dry-run: PR title unavailable)",prBody:"",headRef:"(unknown)",baseRef:"main",headRepoFullName:"",isFork:!1,prState:"open",triggeringCommentId:w?.id??0,comments:w?[{id:w.id,author:w.author,body:w.body,createdAt:"",isTrigger:!0}]:[],...f?{reviewComment:f}:{}}}return{kind:"issue",issueNumber:Number.parseInt(h.INFER_ISSUE_NUMBER??"0",10)||0,issueTitle:h.INFER_ISSUE_TITLE??"",issueBody:h.INFER_ISSUE_BODY??""}}function un(h){let n=(h.INFER_DIRECT_PROMPT??"").trim();if(!n)throw Error("Missing or empty INFER_DIRECT_PROMPT for direct context");return{kind:"direct",prompt:n}}async function kn(h,n){let f=Number.parseInt(h.INFER_ISSUE_NUMBER??"",10);if(!Number.isFinite(f))throw Error("Missing or invalid INFER_ISSUE_NUMBER");let w=h.INFER_ISSUE_TITLE??"",o=h.INFER_ISSUE_BODY??"",u=A(h),[{associatedPrs:k,associatedBranches:y},q]=await Promise.all([qn(n,f),yn(n,f,u?.id??0)]);return{kind:"issue",issueNumber:f,issueTitle:w,issueBody:o,...u?{triggeringComment:u}:{},...k.length?{associatedPrs:k}:{},...y.length?{associatedBranches:y}:{},...q.length?{threadComments:q}:{}}}async function yn(h,n,f){try{return(await h.listIssueComments(n)).map((o)=>({id:o.id,author:o.author,body:o.body,createdAt:o.createdAt,isTrigger:f>0&&o.id===f}))}catch(w){return console.warn(`[context] failed to list comments for issue #${n}; proceeding without the thread:`,w instanceof Error?w.message:w),[]}}async function qn(h,n){let f=`fix/issue-${n}`;try{let[w,o]=await Promise.all([h.getOpenPrForBranch(f),h.findPrsReferencingIssue(n)]),u=new Map;for(let q of o)u.set(q.number,q);if(w){let q=u.get(w.number);u.set(w.number,{number:w.number,url:q?.url||w.url,state:q?.state||"open",headRef:f,baseRef:w.baseRef,isDraft:q?.isDraft??!1,title:q?.title??""})}return{associatedPrs:[...u.values()],associatedBranches:w?[f]:[]}}catch(w){return console.warn(`[context] failed to gather existing work for issue #${n}; proceeding without it:`,w instanceof Error?w.message:w),{associatedPrs:[],associatedBranches:[]}}}async function Wn(h,n){let f=Number.parseInt(h.INFER_ISSUE_NUMBER??"",10);if(!Number.isFinite(f))throw Error("Missing or invalid INFER_ISSUE_NUMBER for PR context");let w=Number.parseInt(h.INFER_TRIGGERING_COMMENT_ID??"",10),o=Number.isFinite(w)?w:0,u=yh(h),[k,y]=await Promise.all([n.getPullRequest(f),u?Yn(h,n,f,o):n.listIssueComments(f).then((Z)=>Z.map((Q)=>({id:Q.id,author:Q.author,body:Q.body,createdAt:Q.createdAt,isTrigger:o>0&&Q.id===o})))]),q=`${n.owner}/${n.repoName}`,$=k.headRepoFullName!==""&&k.headRepoFullName!==q;return{kind:"pull_request",prNumber:f,prTitle:k.title,prBody:k.body,headRef:k.headRef,baseRef:k.baseRef,headRepoFullName:k.headRepoFullName,isFork:$,prState:k.state,triggeringCommentId:o,comments:an(y,h),...u?{reviewComment:u}:{}}}function yh(h){let n=(h.INFER_REVIEW_COMMENT_PATH??"").trim();if(!n)return;let f=Number.parseInt(h.INFER_REVIEW_COMMENT_LINE??"",10),w=Number.parseInt(h.INFER_REVIEW_COMMENT_START_LINE??"",10);return{path:n,diffHunk:h.INFER_REVIEW_COMMENT_DIFF_HUNK??"",...Number.isFinite(f)?{line:f}:{},...Number.isFinite(w)?{startLine:w}:{}}}async function Yn(h,n,f,w){let o=Number.parseInt(h.INFER_REVIEW_COMMENT_IN_REPLY_TO??"",10),u=[];if(Number.isFinite(o)&&o>0){let k=await n.listReviewComments(f);for(let y of k)if(y.id===o||y.inReplyToId===o)u.push({id:y.id,author:y.author,body:y.body,createdAt:y.createdAt,isTrigger:w>0&&y.id===w})}return u}function an(h,n){if(h.some((w)=>w.isTrigger))return h;let f=A(n);return f?[...h,{...f,createdAt:"",isTrigger:!0}]:h}function A(h){let n=h.INFER_TRIGGERING_COMMENT_ID??"",f=h.INFER_TRIGGERING_COMMENT_BODY??"",w=h.INFER_TRIGGERING_COMMENT_AUTHOR??"",o=Number.parseInt(n,10);if(!Number.isFinite(o)||o<=0)return;if(!f.trim())return;return{id:o,body:f,author:w}}class I{token;baseUrl;fetchImpl;constructor(h){this.token=h.token,this.baseUrl=(h.baseUrl||process.env.GITHUB_API_URL||"https://api.github.com").replace(/\/+$/,""),this.fetchImpl=h.fetchImpl??fetch}issues={getComment:(h)=>this.request("GET",`/repos/${h.owner}/${h.repo}/issues/comments/${h.comment_id}`),updateComment:(h)=>this.request("PATCH",`/repos/${h.owner}/${h.repo}/issues/comments/${h.comment_id}`,void 0,{body:h.body}),createComment:(h)=>this.request("POST",`/repos/${h.owner}/${h.repo}/issues/${h.issue_number}/comments`,void 0,{body:h.body}),listComments:(h)=>this.request("GET",`/repos/${h.owner}/${h.repo}/issues/${h.issue_number}/comments`,{per_page:h.per_page,page:h.page}),listEventsForTimeline:(h)=>this.request("GET",`/repos/${h.owner}/${h.repo}/issues/${h.issue_number}/timeline`,{per_page:h.per_page})};pulls={list:(h)=>this.request("GET",`/repos/${h.owner}/${h.repo}/pulls`,{head:h.head,state:h.state,per_page:h.per_page}),get:(h)=>this.request("GET",`/repos/${h.owner}/${h.repo}/pulls/${h.pull_number}`),create:(h)=>this.request("POST",`/repos/${h.owner}/${h.repo}/pulls`,void 0,{head:h.head,base:h.base,title:h.title,body:h.body,draft:h.draft}),listComments:(h)=>this.request("GET",`/repos/${h.owner}/${h.repo}/pulls/${h.pull_number}/comments`,{per_page:h.per_page,page:h.page}),update:(h)=>this.request("PATCH",`/repos/${h.owner}/${h.repo}/pulls/${h.pull_number}`,void 0,{body:h.body}),getComment:(h)=>this.request("GET",`/repos/${h.owner}/${h.repo}/pulls/comments/${h.comment_id}`),updateComment:(h)=>this.request("PATCH",`/repos/${h.owner}/${h.repo}/pulls/comments/${h.comment_id}`,void 0,{body:h.body}),createReview:(h)=>this.request("POST",`/repos/${h.owner}/${h.repo}/pulls/${h.pull_number}/reviews`,void 0,{event:h.event,body:h.body,comments:h.comments})};checks={listForRef:(h)=>this.request("GET",`/repos/${h.owner}/${h.repo}/commits/${h.ref}/check-runs`,{per_page:h.per_page??100})};repos={get:(h)=>this.request("GET",`/repos/${h.owner}/${h.repo}`),createOrUpdateFileContents:(h)=>this.request("PUT",`/repos/${h.owner}/${h.repo}/contents/${h.path}`,void 0,{message:h.message,content:h.content,branch:h.branch})};git={getRef:(h)=>this.request("GET",`/repos/${h.owner}/${h.repo}/git/ref/${h.ref}`),createRef:(h)=>this.request("POST",`/repos/${h.owner}/${h.repo}/git/refs`,void 0,{ref:h.ref,sha:h.sha}),createCommit:(h)=>this.request("POST",`/repos/${h.owner}/${h.repo}/git/commits`,void 0,{message:h.message,tree:h.tree})};async request(h,n,f,w){let o=`${this.baseUrl}${n}`;if(f){let y=new URLSearchParams;for(let[q,$]of Object.entries(f))y.set(q,String($));o+=`?${y.toString()}`}let u={Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","User-Agent":"infer-action"};if(this.token)u.Authorization=`Bearer ${this.token}`;if(w!==void 0)u["Content-Type"]="application/json";let k=await this.fetchImpl(o,{method:h,headers:u,...w!==void 0?{body:JSON.stringify(w)}:{}});if(!k.ok){let y=await k.text().catch(()=>"");throw Error(`GitHub API ${h} ${n} -> ${k.status} ${k.statusText}: ${y.slice(0,300)}`)}if(k.status===204)return{data:void 0};return{data:await k.json()}}}var $n=20,X=100,Jn=2000;function qh(h){return h.replace(/`/g,"")}var U="<!-- infer:plan-end -->",V="<!-- infer:result-start -->",z="infer-artifacts",Kn="4b825dc642cb6eb9a060e54bf8d69288fbee4904",Wh="<!-- infer:spinner -->",S="<!-- /infer:spinner -->",Yh=`${Wh}<img src="https://raw.githubusercontent.com/inference-gateway/infer-action/main/assets/spinner.svg" width="22" height="22" alt="Working" />${S}`;function Zn(h){let n=h.indexOf(Wh);if(n===-1)return h;let f=h.indexOf(S,n);if(f===-1)return h;let w=f+S.length;while(w<h.length&&(h[w]===`
`||h[w]==="\r"))w++;return h.slice(0,n)+h.slice(w)}function On(h){let n=h.indexOf(U),f=h.indexOf(V);if(n===-1&&f===-1)return{plan:h,middle:"",result:""};if(n===-1)return{plan:h.slice(0,f),middle:"",result:h.slice(f+V.length)};if(f===-1)return{plan:h.slice(0,n),middle:h.slice(n+U.length),result:""};return{plan:h.slice(0,n),middle:h.slice(n+U.length,f),result:h.slice(f+V.length)}}function Qn(h){let n=h.plan.trim(),f=h.middle.trim(),w=h.result.trim();if(!f&&!w)return n;let o=n;if(o+=`

${U}`,f)o+=`

${f}`;if(o+=`

${V}`,w)o+=`

${w}`;return o}class l{api;redactor;dryRun;reviewComment;artifactsBranchEnsured=!1;owner;repoName;constructor(h){this.api=h.api??new I({token:h.token}),this.redactor=h.redactor,this.dryRun=h.dryRun??!1,this.reviewComment=h.reviewComment??!1;let[n,f]=h.repo.split("/");if(!n||!f)throw Error(`Invalid repo string "${h.repo}", expected "owner/name"`);this.owner=n,this.repoName=f}commentUrl(h){return`https://github.com/${this.owner}/${this.repoName}/issues/comments/${h}`}issueUrl(h){return`https://github.com/${this.owner}/${this.repoName}/issues/${h}`}prUrl(h){return`https://github.com/${this.owner}/${this.repoName}/pull/${h}`}async getCommentBody(h){return(await(this.reviewComment?this.api.pulls:this.api.issues).getComment({owner:this.owner,repo:this.repoName,comment_id:h})).data.body??""}async updateCommentBody(h,n){let f=this.redactor?this.redactor.redact(n):n;if(this.dryRun){console.log(`[dry-run] would update comment #${h} (${this.commentUrl(h)}):
${f}`);return}await(this.reviewComment?this.api.pulls:this.api.issues).updateComment({owner:this.owner,repo:this.repoName,comment_id:h,body:f})}async createIssueComment(h,n){let f=this.redactor?this.redactor.redact(n):n;if(this.dryRun){console.log(`[dry-run] would create a github issue comment on issue #${h} (${this.issueUrl(h)}):
${f}`);return}await this.api.issues.createComment({owner:this.owner,repo:this.repoName,issue_number:h,body:f})}async updateZone(h,n,f){if(this.dryRun){let u=this.redactor?this.redactor.redact(f):f;console.log(`[dry-run] would update the ${n} zone of comment #${h} (${this.commentUrl(h)}):
${u}`);return}let w=await this.getCommentBody(h),o=On(w);o[n]=f,await this.updateCommentBody(h,Qn(o))}async clearSpinner(h){if(this.dryRun){console.log(`[dry-run] would clear the spinner on comment #${h} (${this.commentUrl(h)})`);return}let n=await this.getCommentBody(h),f=Zn(n);if(f===n)return;await this.updateCommentBody(h,f)}async getOpenPrForBranch(h){let f=(await this.api.pulls.list({owner:this.owner,repo:this.repoName,head:`${this.owner}:${h}`,state:"open",per_page:1})).data[0];if(!f)return null;return{number:f.number,url:f.html_url,body:f.body??"",baseRef:f.base.ref}}async getPrForBranch(h){let n=await this.api.pulls.list({owner:this.owner,repo:this.repoName,head:`${this.owner}:${h}`,state:"all",per_page:20}),f=(k)=>({number:k.number,url:k.html_url,body:k.body??"",baseRef:k.base.ref,state:k.state==="open"?"open":"closed",merged:k.merged_at!=null}),w=n.data.find((k)=>k.state==="open");if(w)return f(w);let o=n.data.find((k)=>k.merged_at!=null);if(o)return f(o);let u=n.data[0];return u?f(u):null}async findPrsReferencingIssue(h){let f=(await this.api.issues.listEventsForTimeline({owner:this.owner,repo:this.repoName,issue_number:h,per_page:X})).data,w=new Map;for(let o of f){if(o.event!=="cross-referenced")continue;let u=o.source?.issue;if(!u||!u.pull_request||typeof u.number!=="number")continue;w.set(u.number,{number:u.number,url:u.html_url??"",state:u.state??"",headRef:"",baseRef:"",isDraft:u.draft??!1,title:u.title??""})}return[...w.values()]}async updatePullRequestBody(h,n){let f=this.redactor?this.redactor.redact(n):n;if(this.dryRun){console.log(`[dry-run] would update PR #${h} body (${this.prUrl(h)}):
${f}`);return}await this.api.pulls.update({owner:this.owner,repo:this.repoName,pull_number:h,body:f})}async createDraftPr(h){let n=this.redactor?this.redactor.redact(h.body):h.body;if(this.dryRun)return console.log(`[dry-run] would open a DRAFT PR ${h.head} -> ${h.base} titled "${h.title}":
${n}`),{number:0,url:"(dry-run)",body:n,baseRef:h.base};let f=await this.api.pulls.create({owner:this.owner,repo:this.repoName,head:h.head,base:h.base,title:h.title,body:n,draft:!0});return{number:f.data.number,url:f.data.html_url,body:f.data.body??"",baseRef:f.data.base.ref}}async uploadArtifactImage(h,n,f){let w=`${h}/${encodeURIComponent(n)}`,o=`https://raw.githubusercontent.com/${this.owner}/${this.repoName}/${z}/${h}/${encodeURIComponent(n)}`;if(this.dryRun)return console.log(`[dry-run] would upload artifact image ${n} to branch ${z} at ${w}`),o;try{return await this.ensureArtifactsBranch(),(await this.api.repos.createOrUpdateFileContents({owner:this.owner,repo:this.repoName,path:w,message:`chore: add run artifact ${n} (run ${h})`,content:Buffer.from(f).toString("base64"),branch:z})).data.content?.download_url||o}catch(u){return console.error(`artifact image upload failed for ${n}:`,u),null}}async ensureArtifactsBranch(){if(this.artifactsBranchEnsured)return;if(await this.artifactsBranchExists()){this.artifactsBranchEnsured=!0;return}let h=await this.api.git.createCommit({owner:this.owner,repo:this.repoName,message:`chore: initialize ${z} branch for run artifacts`,tree:Kn});await this.api.git.createRef({owner:this.owner,repo:this.repoName,ref:`refs/heads/${z}`,sha:h.data.sha}),this.artifactsBranchEnsured=!0}async artifactsBranchExists(){try{return await this.api.git.getRef({owner:this.owner,repo:this.repoName,ref:`heads/${z}`}),!0}catch{return!1}}async createReview(h){if(this.dryRun){console.log(`[dry-run] would submit a ${h.event} review on #${h.pullNumber} with ${h.comments.length} inline comment(s)`);return}await this.api.pulls.createReview({owner:this.owner,repo:this.repoName,pull_number:h.pullNumber,event:h.event,body:h.body,comments:h.comments})}async getDefaultBranch(){return(await this.api.repos.get({owner:this.owner,repo:this.repoName})).data.default_branch}async getPullRequest(h){let n=await this.api.pulls.get({owner:this.owner,repo:this.repoName,pull_number:h});return{title:n.data.title,body:n.data.body??"",headRef:n.data.head.ref,headRepoFullName:n.data.head.repo?.full_name??"",baseRef:n.data.base.ref,state:n.data.merged_at?"merged":n.data.state==="open"?"open":"closed"}}async listIssueComments(h){let n=[],f=2;for(let w=1;w<=2;w++){let o=await this.api.issues.listComments({owner:this.owner,repo:this.repoName,issue_number:h,per_page:X,page:w});for(let u of o.data)n.push({id:u.id,author:u.user?.login??"unknown",body:u.body??"",createdAt:u.created_at});if(o.data.length<X)break}return n}async listReviewComments(h){let n=[],f=2;for(let w=1;w<=2;w++){let o=await this.api.pulls.listComments({owner:this.owner,repo:this.repoName,pull_number:h,per_page:X,page:w});for(let u of o.data)n.push({id:u.id,author:u.user?.login??"unknown",body:u.body??"",createdAt:u.created_at,inReplyToId:u.in_reply_to_id??0});if(o.data.length<X)break}return n}async getPrCheckRuns(h){try{let f=(await this.api.checks.listForRef({owner:this.owner,repo:this.repoName,ref:h})).data.check_runs;if(f.length===0)return"";let w=f.filter((k)=>k.conclusion==="failure"||k.conclusion==="timed_out"||k.conclusion==="action_required"),o=f.filter((k)=>k.status!=="completed"),u=[];for(let k of w){u.push(`- **${qh(k.name)}**: ${k.conclusion}`);let y=k.output?.summary?.trim()||k.output?.text?.trim()||"";if(y){let q=y.split(`
`).slice(0,$n).join(`
`).slice(0,Jn);u.push("  ```"),u.push(q),u.push("  ```")}}if(o.length>0)u.push(`- **${o.length} pending check(s)**: ${o.map((k)=>qh(k.name)).join(", ")}`);if(u.length===0)return"";return`## CI Checks

${u.join(`
`)}`}catch(n){return console.warn(`[github] failed to fetch check runs for ref ${h}:`,n instanceof Error?n.message:n),""}}}var E=["GITHUB_TOKEN","OLLAMA_CLOUD_API_KEY","GROQ_API_KEY","LLAMACPP_API_KEY","OPENAI_API_KEY","CLOUDFLARE_API_KEY","COHERE_API_KEY","ANTHROPIC_API_KEY","DEEPSEEK_API_KEY","GOOGLE_API_KEY","MISTRAL_API_KEY","MINIMAX_API_KEY","MOONSHOT_API_KEY","NVIDIA_API_KEY","ZAI_API_KEY","OTEL_EXPORTER_OTLP_HEADERS","MEMORY_TOKEN","MEMORY_DEPLOY_KEY"],Hn=["-----BEGIN [A-Z ]*PRIVATE KEY( BLOCK)?-----[\\s\\S]+?-----END [A-Z ]*PRIVATE KEY( BLOCK)?-----"],zn=["github_pat_[A-Za-z0-9_]{82,}","gh[pours]_[A-Za-z0-9]{36,}","AIza[0-9A-Za-z_-]{35}","xox[bpoa]-[A-Za-z0-9-]{20,}","sk-[A-Za-z0-9_-]{20,}","eyJ[A-Za-z0-9_-]+\\.eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]{10,}"];var Dn=/[.*+?^${}()|[\]\\]/g;function _(h,n,f=8){let w=[],o=new Set;for(let u of n){let k=h[u];if(typeof k!=="string")continue;if(k.trim().length<f)continue;if(o.has(k))continue;o.add(k),w.push(k)}return w}function ah(h){let n=new Set;for(let f of h){if(!f||n.has(f))continue;n.add(f),process.stdout.write(`::add-mask::${f}
`)}}function $h(h={}){let n=h.placeholder??"***",f=h.minLength??8,w=h.env??process.env,o=h.heuristics??!1,u=_(w,E,f);u.sort((q,$)=>$.length-q.length);let k=u.map(jn);if(k.push(...Hn),o)k.push(...zn);let y=k.length>0?new RegExp(k.join("|"),"g"):null;return{secretCount:u.length,redact(q){if(!y||!q)return q;return q.replace(y,n)}}}function jn(h){return h.replace(Dn,"\\$&")}var P="/tmp/agent-output.txt",v="/tmp/infer-todos.json",s="/tmp/infer-cancelled",Jh="/tmp/infer-gateway-version";function L(h){let n=process.env[h];if(!n)throw Error(`Missing required env var ${h}`);return n}function Y(h){return process.env[h]??""}function Kh(){let h=Y("INFER_DRY_RUN")==="true",n=h?Y("GITHUB_TOKEN"):L("GITHUB_TOKEN"),f=L("INFER_REPO"),w=Y("INFER_ENABLE_GIT_OPERATIONS")!=="false",o=Y("INFER_REDACT_HEURISTICS")==="true",u=_(process.env,E);ah(u);let k=$h({env:process.env,heuristics:o}),y=Y("INFER_COOKING_COMMENT_IS_REVIEW")==="true",q=new l({token:n,repo:f,redactor:k,dryRun:h,reviewComment:y});return{dryRun:h,token:n,repo:f,enableGitOps:w,enableHeuristics:o,redactor:k,github:q}}async function Zh(h,n,f){try{return await uh(h,n)}catch(w){if(f.failHard)throw w;return console.warn(`[${f.stepName}] context read failed (${w.message}); proceeding with env-derived data`),kh(h)}}var Un=3000,Vn=300000,Ln=2000;async function Oh(h,n,f={}){let w=f.readConfig?f.readConfig():Nn(h,n);if(!w)return"";let o=await Pn(w.url,f.fetcher??fetch,f.intervalMs,f.deadlineMs);if(o)return o;if(!w.run)return"";if(w.oci&&!w.standaloneBinary)return Tn(w.oci);return f.binaryVersion?f.binaryVersion():Sn()}function Qh(h){return h?`v${h}`:""}async function Pn(h,n=fetch,f=Un,w=Vn){let o=`${h.replace(/\/+$/,"")}/version`,u=Date.now()+w;for(;;){let k=await Gn(o,n);if(k)return k;if(Date.now()+f>=u)return"";await new Promise((y)=>setTimeout(y,f).unref())}}async function Gn(h,n){try{let f=await n(h,{signal:AbortSignal.timeout(Ln)});if(f.ok){let w=Bn(await f.text());if(w)return w}}catch{return null}return null}function Bn(h){return Mn(h)??G(h)}function Mn(h){try{let n=JSON.parse(h);if(n&&typeof n==="object"&&typeof n.version==="string")return G(n.version)}catch{return null}return null}function G(h){let n=h.trim().replace(/^v/,""),f=n[0]??"";if(n===""||n.length>32||f<"0"||f>"9")return"";return/^[0-9A-Za-z.+-]+$/.test(n)?n:""}function Tn(h){let n=h.slice(h.lastIndexOf("/")+1),f=n.indexOf(":");if(f>=0)n=n.slice(f+1);return G(n)}function Nn(h,n){try{let f=ih(h,["config","get","gateway","--format","json"],{env:n,encoding:"utf8",timeout:15000,stdio:["ignore","pipe","pipe"]});if(f.status!==0)return null;return An(f.stdout??"")}catch{return null}}function An(h){let n=JSON.parse(h),f=typeof n.url==="string"?n.url:"";if(!f)return null;return{url:f,run:n.run!==!1,oci:typeof n.oci==="string"?n.oci:"",standaloneBinary:n.standalone_binary===!0}}function In(h=Rn()){let n=process.platform==="win32"?"inference-gateway.exe":"inference-gateway";return Fn(h,".infer","bin",n)}function Sn(h=ih,n=In()){try{let f=h(n,["--version"],{encoding:"utf8",timeout:5000,stdio:["ignore","pipe","pipe"]}),w=(f.stdout??"").trim().split(/\s+/).filter(Boolean);if(f.status!==0)return"";return G(w[w.length-1]??"")}catch{return""}}function Hh(h){try{Xn(Jh,h)}catch(n){console.error("[gateway] failed to persist gateway version:",n)}}function zh(h,n){return{model:n,actionVersion:h.INFER_ACTION_VERSION??"",cliVersion:h.INFER_CLI_VERSION??"",gatewayVersion:"",workflowUrl:h.INFER_WORKFLOW_URL??""}}function Dh(h){return[`**Model:** \`${h.model}\``,h.actionVersion?`**Action:** ${ln(h.actionVersion)}`:"",h.cliVersion?`**CLI:** \`${h.cliVersion}\``:"",h.gatewayVersion?`**Gateway:** \`${h.gatewayVersion}\``:"",h.workflowUrl?`[View Job](${h.workflowUrl})`:""].filter(Boolean).join(" \xB7 ")}function ln(h){let n=/^[0-9a-f]{40}$/.test(h)?`https://github.com/inference-gateway/infer-action/commit/${h}`:`https://github.com/inference-gateway/infer-action/releases/tag/${h}`;return`[\`${h}\`](${n})`}var jh=(h)=>/^(true|1)$/i.test((h??"").trim());function Xh(h){let n=(h.INFER_MIRROR_AGENT_LOGS??"").trim();return{stdout:n!==""?jh(n):jh(h.INFER_LOGGING_DEBUG),stderr:!0}}import En from"readline";async function*Fh(h){let n=En.createInterface({input:h,crlfDelay:1/0}),f=null;for await(let w of n){if(f){if(f.push(w),w==="}"){let k=Rh(f.join(`
`));if(f=null,k)yield k}continue}let o=w.trim();if(!o)continue;if(o==="{"){f=[o];continue}if(o[0]!=="{")continue;let u=Rh(o);if(u)yield u}}function Rh(h){try{let n=JSON.parse(h);if(typeof n!=="object"||n===null)return null;let{role:f,type:w}=n;if(typeof f==="string"||w==="session_stats"||w==="compaction_started"||w==="compaction_completed")return n;return null}catch{return null}}var Uh={SYSTEM_DIRECT:`# Infer Agent (manual run)

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

Run \`git diff origin/{{baseRef}}...HEAD\` for the full diff and \`git log origin/{{baseRef}}..HEAD\` for the commit history.{{triggerSection}}`};function _n(h){let n=process.env[`INFER_PROMPT_OVERRIDE_${h}`];return n&&n.trim()?n:Uh[h]}function vn(h){let n=process.env[`INFER_PROMPT_OVERRIDE_${h}`];return n&&n.trim()?n:null}var Vh=["git commit","git push","gh pr create","gh pr ready","git status"],sn=["git commit","git push","git status"],Cn=["git commit","git push"],gn={SYSTEM_ISSUE:Vh,SYSTEM_DIRECT:Vh,SYSTEM_PR:sn,SYSTEM_PR_FORK:Cn};function bn(h){if(h.kind==="issue")return"SYSTEM_ISSUE";if(h.kind==="direct")return"SYSTEM_DIRECT";if(h.isFork)return"SYSTEM_PR_FORK";return"SYSTEM_PR"}function Lh(h){let n=bn(h),f=vn(n);if(f===null)return[];let w=gn[n];if(!w||w.length===0)return[];let o=w.filter((u)=>!f.includes(u));return o.length>0?[{key:n,missing:o}]:[]}function O(h,n={}){return _n(h).replace(/\{\{(\w+)\}\}/g,(f,w)=>{if(!(w in n))throw Error(`Missing variable "${w}" for prompt "${h}"`);return String(n[w])})}function Ph(h,n={}){if(h.kind==="issue")return en(h);if(h.kind==="direct")return cn(h);return pn(h,n.diffStat??"",n.ciChecksSection??"")}var rn=`## A2A Agents

Delegated A2A tasks run in the background and you are notified automatically when they complete. Submit each task exactly once with A2A_SubmitTask, then WAIT for the completion notification - never resubmit the same task or poll for it in a loop. Only retry a submission if the submission call itself failed (e.g. the agent container was still starting).`,dn='## Images in the conversation\n\nIssue/PR text may embed images (`![...](url)` or `<img src="...">`) - screenshots, error dialogs, diagrams. These often carry the crux of the request, so read them BEFORE starting work: download each with WebFetch (`download=true`), then run ImageDecode on the saved file path, passing a `prompt` asking for what you need (e.g. the exact error text, the UI elements shown). If a download fails (private-repo attachments may be inaccessible), say so in your final response and continue with the text.',mn='## Inline review mode\n\nWhen review-inline is enabled, the runner submits your review as a real GitHub\npull request review with inline, line-anchored comments. ALWAYS end your final\nmessage with a fenced JSON block carrying your verdict and structured findings,\neven when there are no findings:\n\n````json:findings\n{\n  "verdict": "comment",\n  "findings": [\n    {\n      "path": "src/parser.ts",\n      "line": 42,\n      "side": "RIGHT",\n      "start_line": 40,\n      "body": "Off-by-one on the loop bound.\\n\\n```suggestion\\nfor (let i = 0; i < n; i++) {\\n```"\n    }\n  ]\n}\n````\n\nSet `"verdict": "approve"` only when the PR is ready to merge as-is and\n`findings` is empty; otherwise use `"comment"`. An approve verdict is\nsubmitted as an approval (or as a comment review on a PR you opened yourself).\n\nEach finding must reference a file and line that exists in the PR diff.\nUse `side: "RIGHT"` for new code, `"LEFT"` for the base. For multi-line\ncomments include `start_line` and `start_side`. The `body` can carry\n```suggestion blocks the PR author can apply with one click. The runner\nstrips this block from the summary comment, so your prose above it is still\nvisible there.';function Gh(h,n){let f=xn(h);if(process.env.INFER_A2A_ENABLED==="true")f=`${f}

${rn}`;if(process.env.INFER_VISION_ANNOTATOR_ENABLED==="true")f=`${f}

${dn}`;if(h.kind==="pull_request"&&process.env.INFER_REVIEW_MODE==="true"&&process.env.INFER_REVIEW_INLINE==="true")f=`${f}

${mn}`;if(n.trim())return`${f}

## Additional Instructions

${n}`;return f}function xn(h){if(h.kind==="issue")return O("SYSTEM_ISSUE",{issueNumber:h.issueNumber});if(h.kind==="direct")return O("SYSTEM_DIRECT");if(h.isFork)return O("SYSTEM_PR_FORK",{prNumber:h.prNumber,headRef:h.headRef,headRepoFullName:h.headRepoFullName,baseRef:h.baseRef});return O("SYSTEM_PR",{prNumber:h.prNumber,headRef:h.headRef,baseRef:h.baseRef})}function cn(h){return O("TASK_DIRECT",{prompt:h.prompt})}function en(h){let n=h.triggeringComment?`

## Triggering comment from @${h.triggeringComment.author}

${h.triggeringComment.body}

Treat this comment as the user's most recent intent. If it asks for something more specific than the issue body, prioritise it.`:"";return O("TASK_ISSUE",{issueNumber:h.issueNumber,issueTitle:h.issueTitle,issueBody:h.issueBody,existingWorkSection:tn(h),recentCommentsSection:Bh((h.threadComments??[]).filter((f)=>!f.isTrigger),"Recent comments (chronological)"),triggeringCommentSection:n})}function Bh(h,n){let f=h.filter((k)=>!k.author.endsWith("[bot]")),w=f.slice(-3);if(w.length===0)return"";let o=f.length-w.length,u=o>0?`_\u2026${o} earlier comment${o===1?"":"s"} omitted_

`:"";return`

## ${n}

${u}${w.map(Mh).join(`

`)}`}function tn(h){let n=h.associatedPrs??[],f=h.associatedBranches??[];if(n.length===0&&f.length===0)return"";let w=["## Existing work for this issue","A prior run or another contributor may already have started on this issue. Before creating a branch, inspect the items below and CONTINUE from them if they contain relevant work - check it out (`gh pr checkout <number>`, or `git fetch origin <branch> && git checkout <branch>`) and build on top of it rather than starting fresh. Only start a new branch if none of these apply."];if(n.length){let o=n.map((u)=>{let k=u.isDraft?" (draft)":"",y=u.state&&u.state!=="open"?` [${u.state}]`:"",q=u.headRef?` - branch \`${u.headRef}\``:"",$=u.title?` - ${u.title}`:"";return`- PR #${u.number}${k}${y}${q}: ${u.url}${$}`});w.push(`### Pull requests

`+o.join(`
`))}if(f.length)w.push(`### Branches

`+f.map((o)=>`- \`${o}\``).join(`
`));return`

`+w.join(`

`)}function pn(h,n,f){let w=h.isFork?`
Head lives in a fork: ${h.headRepoFullName}. You CANNOT push commits to it from this runner.`:"";if(h.prState!=="open")w+=`
This PR is already ${h.prState}. Its head branch may have been deleted, and the checkout is likely on the default branch. Treat the request as follow-up work: if it needs no code changes (e.g. filing a follow-up issue), just do that; if it needs code changes, create a NEW branch off ${h.baseRef} and open a new PR - never push to the old head branch.`;let o=h.comments.find((Z)=>Z.isTrigger),u=o?`

## Triggering comment from @${o.author} (id: ${o.id})

${o.body}

This is the user's most recent ask. Address it directly. Do not re-implement existing changes unless this comment asks for that.`:"",k=h.comments.filter((Z)=>!Z.isTrigger);if(h.reviewComment)return hf(h,h.reviewComment,{forkNotice:w,triggerSection:u,others:k});let y=Bh(k,"Other comments (chronological)"),q=h.prBody.trim()?h.prBody:"_(no description)_",$=n.trim()?"```\n"+n.trim()+"\n```":"_(no changes on this branch yet)_";return O("TASK_PR",{prNumber:h.prNumber,prTitle:h.prTitle,headRef:h.headRef,baseRef:h.baseRef,forkNotice:w,prBody:q,triggerSection:u,otherCommentsSection:y,diffStatSection:$,ciChecksSection:f})}function hf(h,n,f){let w=n.startLine&&n.line&&n.startLine!==n.line?`, lines ${n.startLine}-${n.line}`:n.line?`, line ${n.line}`:"",o=f.others.length>0?`

## Earlier comments in this review thread

${f.others.map(Mh).join(`

`)}`:"";return O("TASK_PR_REVIEW",{prNumber:h.prNumber,prTitle:h.prTitle,headRef:h.headRef,baseRef:h.baseRef,forkNotice:f.forkNotice,filePath:n.path,lineInfo:w,diffHunk:n.diffHunk,threadSection:o,triggerSection:f.triggerSection})}function Mh(h){return`**@${h.author}** \xB7 ${h.createdAt}

${h.body}`}function nf(h){if(!Number.isFinite(h)||h<=0)return 10;return Math.max(10,Math.round(h*0.1))}function ff(h){return Math.max(1,Math.floor(h*0.8))}function wf(h){if(h.kind==="direct")return h.prompt;if(h.kind==="issue")return h.triggeringComment?.body??`${h.issueTitle}
${h.issueBody}`;return h.comments.find((n)=>n.isTrigger)?.body??`${h.prTitle}
${h.prBody}`}function Nh(h){return/\bdemo(s|nstrat\w*)?\b/i.test(wf(h))}function of(h,n){let f=[],w=n.enableGitOps&&!(h.kind==="pull_request"&&h.isFork);if(f.push({name:"infer-action-context",hook:"pre_stream",trigger:"interval",interval:5,text:n.enableGitOps?uf(h):"<system-reminder>Keep your TodoWrite plan current as you go. Only answering a question? Ignore this.</system-reminder>"}),w){if(f.push({name:"infer-action-wrap-up",hook:"pre_stream",trigger:"turns_before_max",threshold:nf(n.maxTurns??0),text:Th(h)}),n.maxDurationMinutes&&n.maxDurationMinutes>0)f.push({name:"infer-action-wrap-up-time",hook:"pre_stream",trigger:"elapsed_minutes",threshold:ff(n.maxDurationMinutes),text:Th(h,"time budget")});f.push({name:"infer-action-failed-tool",hook:"post_tool",trigger:"on_failure",text:yf()})}if(n.recordDemo)f.push({name:"infer-action-record-demo",hook:"pre_stream",trigger:"once",text:kf()});return f}function uf(h){if(h.kind==="pull_request"&&h.isFork)return"<system-reminder>This PR is from a fork - you CANNOT commit or push. Investigate with file reads and git diff, then answer the user's question or summarise. Keep your TodoWrite plan current.</system-reminder>";if(h.kind==="pull_request")return`<system-reminder>Keep your TodoWrite plan current. If you changed files, commit + push after each step so PR #${h.prNumber} stays current - unpushed work is lost when the job ends. Only reviewing or answering? Do not change, commit, or push anything.</system-reminder>`;return"<system-reminder>Keep your TodoWrite plan current. Changing code? Work on a pushed branch with an open draft PR (`gh pr create --draft`) and commit + push after each step so nothing is lost - never commit on or push to main. Only answering a question? Ignore this.</system-reminder>"}function Th(h,n="turn limit"){let f=h.kind==="pull_request"?`so PR #${h.prNumber} is up to date, and update the PR body with a checklist of the remaining todos`:"and make sure the draft PR exists: `gh pr create --draft` with a title like `wip: <short description of the task>` and a body listing the remaining todos and unfinished work, so a human can pick up where you left off";return`<system-reminder>You are close to the ${n}. Stop starting new work - if you have uncommitted or unpushed changes, commit and push them now ${f}. If the repo's checks fail on commit and you cannot fix them before the ${n}, commit with --no-verify as a last resort rather than losing the work. Unpushed work is lost when the run ends. If you changed nothing, just finish your summary.</system-reminder>`}function kf(){return'<system-reminder>The user asked for a demo: load the `demo` skill now and follow it.\nAdd "Record the demo" as your last todo - the recording comes after the work is committed and\npushed, and ends as one GIF where the skill says.</system-reminder>'}function yf(){return"<system-reminder>That tool call FAILED - the change did NOT happen. Re-read or re-check, fix it, and retry. Never mark a todo done or claim success on a failed call.</system-reminder>"}function qf(h){let n=["enabled: true","merge: true","reminders:"];for(let f of h){if(n.push(`  - name: ${JSON.stringify(f.name)}`),n.push(`    hook: ${JSON.stringify(f.hook)}`),n.push(`    trigger: ${JSON.stringify(f.trigger)}`),f.interval!==void 0)n.push(`    interval: ${f.interval}`);if(f.threshold!==void 0)n.push(`    threshold: ${f.threshold}`);n.push(`    text: ${JSON.stringify(f.text)}`)}return n.join(`
`)+`
`}function Ah(h,n,f){let w=of(n,f),o=h.trim();if(!o)return qf(w);return Wf(o,w)}function Wf(h,n){let f=Yf(h);if(!f)return`${h}
`;let w=f.reminders??[],o=new Set(w.map((k)=>k.name)),u=[...w,...n.filter((k)=>!o.has(k.name))];return`${JSON.stringify({...f,reminders:u})}
`}function Yf(h){let n;try{n=Bun.YAML.parse(h)}catch{return}if(typeof n!=="object"||n===null||Array.isArray(n))return;let f=n.reminders;if(f!=null&&!Array.isArray(f))return;return n}import{execFileSync as af}from"child_process";import{appendFileSync as Ih,existsSync as Jw,readFileSync as $f,rmSync as Jf,writeFileSync as Kf}from"fs";var Zf=60000,Sh=2000;function lh(){try{Kf(s,"1")}catch(h){console.error("[runner] failed to write cancel marker:",h)}}function Eh(){try{Jf(s,{force:!0})}catch{return}}var C=2,_h=3;function vh(h,n=g){try{return n(`git diff --stat origin/${Of(h)}...HEAD`)}catch(f){return console.error("[runner] git diff --stat failed:",f),""}}function sh(h,n=(f)=>f){try{let o=$f(P,"utf8").split(`
`).filter((u)=>u.trim()!=="").slice(-h);if(o.length===0)return;console.error("=========================================="),console.error(`[recover] last ${o.length} line(s) of agent activity before it stopped:`),console.error("------------------------------------------");for(let u of o){let k=u.length>Sh?u.slice(0,Sh)+" \u2026":u;console.error(n(k))}console.error("==========================================")}catch(f){console.error("[recover] could not read agent transcript for breadcrumb:",f)}}function g(h){return af("bash",["-c",h],{encoding:"utf8",timeout:Zf,env:{...process.env,GIT_TERMINAL_PROMPT:"0"}})}function Of(h){return`'${h.replace(/'/g,"'\\''")}'`}function D(h,n){let f=process.env.GITHUB_OUTPUT;if(!f){console.log(`(would set output) ${h}=${n}`);return}if(n.includes(`
`)){let w=`_GHO_EOF_${Math.random().toString(36).slice(2)}`;Ih(f,`${h}<<${w}
${n}
${w}
`)}else Ih(f,`${h}=${n}
`)}function gh(h){return typeof h==="object"&&h!==null&&h.role==="tool"&&typeof h.content==="string"}function bh(h){if(typeof h!=="object"||h===null)return!1;let n=h.type;return n==="compaction_started"||n==="compaction_completed"}var Ch="Result of tool call: ";function rh(h){let n=h.startsWith(Ch)?h.slice(Ch.length):h;if(!n.startsWith("{"))return null;try{let f=JSON.parse(n);if(typeof f==="object"&&f!==null)return f;return null}catch{return null}}class b{handlers=new Map;flushers=[];listeners=[];on(h,n){return this.handlers.set(h,n),this}onMessage(h){return this.listeners.push(h),this}addFlusher(h){return this.flushers.push(h),this}async observe(h){for await(let n of h){for(let o of this.listeners)try{o(n)}catch(u){console.error("[ticker] message listener threw:",u)}if(!gh(n))continue;let f=rh(n.content);if(!f?.tool_name)continue;let w=this.handlers.get(f.tool_name);if(!w)continue;try{await w(f,n)}catch(o){console.error(`[ticker] handler for ${f.tool_name} threw:`,o)}}}async flush(){for(let h of this.flushers)try{await h()}catch(n){console.error("[ticker] flusher threw:",n)}}}function dh(h,n){let f=null,w=null,o=null,u=async()=>{if(w=null,!f)return;let k=f.value;f=null,o=h(k).catch((y)=>{console.error("[throttle] fn threw:",y)}).finally(()=>{o=null}),await o};return{call(k){if(f={value:k},!w)w=setTimeout(()=>{u()},n)},async flush(){if(w)clearTimeout(w),w=null;if(f)await u();else if(o)await o}}}function mh(h){let n=Math.floor(h/1000);if(n<60)return`${n}s`;let f=Math.floor(n/60),w=n%60;if(f<60)return`${f}m ${w}s`;let o=Math.floor(f/60),u=f%60;return`${o}h ${u}m ${w}s`}var jf=1500,Xf=130,Rf=2000;async function Ff(){let{dryRun:h,enableGitOps:n,redactor:f,github:w}=Kh(),o=Y("INFER_REVIEW_MODE")==="true",u=n&&!o,k=Y("INFER_COOKING_COMMENT_ID"),y=k?Number.parseInt(k,10):0,q=Number.isFinite(y)&&y>0,$=L("INFER_AGENT_MODEL"),Z=zh(process.env,$),Q=Y("INFER_CUSTOM_INSTRUCTIONS"),ch=Y("INFER_BASH_ALLOW_APPEND"),r=Y("INFER_LOGGING_DEBUG")==="true",B=Xh(process.env),J=await Zh(process.env,w,{stepName:"dry-run",failHard:!h});if(J.kind==="pull_request"&&(n||o))try{Mf(J)}catch(W){if(!h)throw W;console.warn("[dry-run] PR head checkout failed; continuing on the current branch:",W instanceof Error?W.message:W)}let eh=J.kind==="pull_request"?vh(J.baseRef):"",th=J.kind==="pull_request"?await w.getPrCheckRuns(J.headRef):"",d=Gh(J,Q),m=Ph(J,{diffStat:eh,ciChecksSection:th});if(u)for(let W of Lh(J)){let a=W.key.replace(/^SYSTEM_/,"").toLowerCase().replace(/_/g,"-");process.stdout.write(`::warning::INFER_PROMPT_OVERRIDE_${W.key} replaces the bundled system prompt (system-prompt-${a} / src/prompts/system-${a}.md) and is missing the git-safety markers: ${W.missing.join(", ")}. The default guards against lost work (branch-first, commit-per-todo, push, draft PR, finish checklist); your override dropped those instructions, so the agent may leave changes uncommitted or unpushed. Re-add them to your override, or use the custom-instructions input to layer extras on top of the default instead of replacing it.
`)}let ph=Y("INFER_REMINDERS_CONFIG"),M=Y("INFER_COMPUTER_USE_RECORDING_ENABLED")==="true"&&Nh(J),x=Ah(ph,J,{enableGitOps:u,maxTurns:Number.parseInt(Y("INFER_AGENT_MAX_TURNS"),10)||0,recordDemo:M,maxDurationMinutes:Number.parseInt(Y("INFER_AGENT_MAX_DURATION_MINUTES"),10)||0}),c=oh(u,ch,M),R=Y("INFER_BIN")||"infer",hn=Y("INFER_NO_COLOR")==="true",T=Vf(process.env,{systemPrompt:d,bashAllowAppend:c,remindersYaml:x,reviewMode:o,recordDemo:M});console.log("=========================================="),console.log("SYSTEM PROMPT:"),console.log("==========================================");let e=Y("INFER_BIN")?void 0:Lf(R,T);if(console.log(e===void 0?d:Pf(e,r)),console.log("=========================================="),console.log(""),console.log("Running agent with task:"),console.log(m),console.log("---"),h)console.log("=========================================="),console.log("DRY RUN - the agent would be invoked with:"),console.log("=========================================="),console.log(`Model:        ${$}`),console.log(`Context kind: ${J.kind}`),console.log(`Git ops:      ${n?"enabled":"disabled"}`),console.log(`Review mode:  ${o?"enabled (Edit/Write/Delete disabled)":"disabled"}`),console.log(`INFER_BIN:    ${R}`),console.log("--- REMINDERS (INFER_REMINDERS_CONFIG) ---"),console.log(x),console.log("--- BASH ALLOW-LIST APPEND (added to the CLI read-only baseline) ---"),console.log(c||"(none - CLI read-only baseline only)"),console.log("==========================================");If(),Eh();let nn=Date.now(),t=["headless","--format","json-pretty","-m",$,m];if(hn)t.push("--no-colors");let K=Qf(R,t,{stdio:["inherit","pipe","pipe"],env:T});if(!K.stdout||!K.stderr)throw Error("child stdio not piped - this should not happen");let p=!1,hh=!1,nh=(W)=>{if(hh)return;hh=!0,p=!0,lh(),console.error(`[runner] received ${W}; stopping the agent so the salvage step can recover its work`);try{K.kill("SIGKILL")}catch(a){console.error("[runner] failed to stop agent child:",a)}};process.once("SIGTERM",()=>nh("SIGTERM")),process.once("SIGINT",()=>nh("SIGINT"));let F=zf(P),fh=new Df;if(K.stdout.pipe(F,{end:!1}),B.stdout)K.stdout.pipe(process.stdout,{end:!1});else console.log("[runner] agent stdout muted (set mirror-agent-logs: true or debug: true to mirror); stderr still shown, full transcript written to /tmp/agent-output.txt");K.stdout.pipe(fh),K.stdout.on("end",()=>F.end()),K.stderr.on("data",(W)=>{if(F.write(W),B.stderr)process.stderr.write(W)});let j=new b,wh=[],H=q?dh(async(W)=>{let a=Gf(W,Z);try{await w.updateZone(y,"plan",a),console.log(`[ticker] updated plan section (${W.length} todos)`)}catch(fn){console.error("[ticker] PATCH failed:",fn)}},jf):null;if(H)j.addFlusher(H.flush),H.call([]);else console.log("[ticker] no cooking comment; plan mirroring disabled (direct mode)");if(j.on("TodoWrite",(W)=>{let a=W.data?.todos;if(!Array.isArray(a))return;if(Af(a),wh=a,H)H.call(a)}),Uf(Z,R,T,()=>{if(H)H.call(wh)}),r)j.onMessage((W)=>{if(bh(W)){console.log(W.type==="compaction_started"?"[agent] context compaction started (summarising older turns)\u2026":"[agent] context compaction completed");return}let a=W;if(a.role==="user"&&a.hidden===!0&&a.kind==="system_reminder")console.log("[agent] system reminder injected")});await j.observe(Fh(fh)),await j.flush();let i=await Tf(K),N=Date.now()-nn;if(console.log(""),console.log("=========================================="),console.log(`Agent exited with code ${i}`),console.log(`Duration: ${mh(N)}`),console.log("=========================================="),p){if(D("run-duration-ms",String(N)),await Nf(F),B.stdout)sh(40,f.redact);return console.error("[runner] cancelled mid-run; the salvage step will recover any work and report the timeout"),Xf}if(D("exit-code",String(i)),D("run-duration-ms",String(N)),i===C||i===_h){let W=i===C?"turn limit":"time budget";return D("result",`Agent stopped early (reached the ${W})`),console.error(`[runner] agent reached the ${W}; the salvage step will recover any unpushed work and the report renders a stopped-early status`),0}return D("result",i===0?"Agent completed successfully":`Agent failed with exit code ${i}`),i}function Uf(h,n,f,w){if(Y("INFER_BIN"))return;Oh(n,f).then((o)=>{if(!o)return;console.log(`[runner] gateway version: ${o}`),h.gatewayVersion=Qh(o),Hh(h.gatewayVersion),w()}).catch((o)=>console.error("[runner] gateway version probe failed:",o))}function Vf(h,n){return{...h,INFER_PROMPTS_AGENT_SYSTEM_PROMPT:n.systemPrompt,INFER_AGENT_SYSTEM_PROMPT_WITH_DEFAULTS:"true",INFER_TOOLS_BASH_ALLOW_APPEND:n.bashAllowAppend,INFER_REMINDERS_CONFIG:n.remindersYaml,INFER_REVIEW_INLINE:h.INFER_REVIEW_INLINE??"",INFER_COMPUTER_USE_RECORDING_ENABLED:String(n.recordDemo),...n.reviewMode?{INFER_TOOLS_EDIT_ENABLED:"false",INFER_TOOLS_WRITE_ENABLED:"false",INFER_TOOLS_DELETE_ENABLED:"false"}:{},OTEL_EXPORTER_OTLP_ENDPOINT:h.OTEL_EXPORTER_OTLP_ENDPOINT??"",OTEL_EXPORTER_OTLP_HEADERS:h.OTEL_EXPORTER_OTLP_HEADERS??"",OTEL_SERVICE_NAME:h.OTEL_SERVICE_NAME??"infer-action",OTEL_RESOURCE_ATTRIBUTES:h.OTEL_RESOURCE_ATTRIBUTES??""}}function Lf(h,n){try{let f=Hf(h,["debug","agent","system_prompt"],{env:n,encoding:"utf8",timeout:30000});if(f.status!==0||!f.stdout?.trim())return;return f.stdout}catch{return}}function Pf(h,n){if(n)return h;let f=h.indexOf("PERSISTENT MEMORY INDEX");if(f===-1)return h;let w=h.slice(f),o=w.indexOf(`

Current date:`),u=o===-1?"":w.slice(o);return`${h.slice(0,f)}PERSISTENT MEMORY INDEX: [redacted - set debug: true to include memory entries]${u}`}function Gf(h,n){let f=`${Yh}

${Dh(n)}`;if(h.length===0)return`${f}

### Todos

_(agent has not posted a plan yet)_`;let w=h.map((o)=>{return`- ${o.status==="completed"?"[x]":o.status==="in_progress"?"[~]":"[ ]"} ${o.content}`});return[f,"","### Todos","",...w].join(`
`)}function Bf(h){let n=h.stderr;return((typeof n==="string"?n:"")+String(h.message)).includes("couldn't find remote ref")}function Mf(h,n=g){try{if(h.isFork){let f=`pr-${h.prNumber}`;console.log(`[runner] fork PR; fetching pull/${h.prNumber}/head into ${f}`),n(`git fetch origin pull/${h.prNumber}/head:${f}`),n(`git checkout ${f}`)}else{console.log(`[runner] checking out PR head branch ${h.headRef}`);try{n(`git fetch origin ${h.headRef}`)}catch(f){if(!Bf(f))throw f;process.stdout.write(`::warning::PR head branch ${h.headRef} no longer exists on origin (likely deleted when the PR was closed or merged); recreating it from pull/${h.prNumber}/head. If the PR is closed or merged, pushing will not reopen it.
`),n(`git fetch origin pull/${h.prNumber}/head:${h.headRef}`)}n(`git checkout ${h.headRef}`)}}catch(f){throw Error(`Failed to check out PR head (${h.headRef}). Aborting before spawning the agent so it doesn't run against the wrong branch.`,{cause:f})}}async function Tf(h){if(h.exitCode!==null)return h.exitCode;return new Promise((n)=>{h.on("close",(f)=>n(f??0))})}async function Nf(h){if(h.writableFinished)return;await Promise.race([new Promise((n)=>h.once("finish",n)),new Promise((n)=>setTimeout(n,Rf).unref())])}function Af(h){try{xh(v,JSON.stringify(h))}catch(n){console.error("[runner] failed to persist todos:",n)}}function If(){try{xh(v,"[]")}catch{return}}if(import.meta.main)Ff().then((h)=>process.exit(h),(h)=>{console.error("[runner] uncaught error:",h),process.exit(1)});export{Lf as resolveMergedSystemPrompt,Gf as renderPlan,Pf as redactMemoryIndex,Mf as ensurePrHeadCheckedOut,Vf as buildChildEnv};
