#!/usr/bin/env bun
// @bun
import{spawn as qo,spawnSync as Wo}from"child_process";import{createWriteStream as Yo,writeFileSync as bh}from"fs";import{PassThrough as $o}from"stream";var hn=["git add( .*)?","git commit( .*)?","git push( .*)?","git checkout( .*)?","git switch( .*)?","git fetch( .*)?","git restore( .*)?","git reset( .*)?","git stash( .*)?","gh pr create( .*)?","gh pr ready( .*)?","gh pr edit( [0-9]+)? --(title|body|body-file)( .*)?",String.raw`gh api graphql -f query='query ?[({][^']*'( --jq '[^']*')?`,String.raw`gh api graphql -f query='mutation\(\$id:ID!\)\{resolveReviewThread\(input:\{threadId:\$id\}\)\{thread\{isResolved\}\}\}' -f id=PRRT_[A-Za-z0-9_-]+`],nn=["tmux (send-keys|capture-pane)( .*)?","ffmpeg( .*)?"];function wh(h,n,o=!1){return[...h?hn:[],...o?nn:[],n.trim()].filter(Boolean).join(",")}import{spawnSync as Kh}from"child_process";import{readFileSync as Io,writeFileSync as jn}from"fs";import{homedir as sn}from"os";import{join as Hn}from"path";async function uh(h,n){let o=h.INFER_CONTEXT_KIND;if(!o)throw Error("Missing required env var INFER_CONTEXT_KIND");if(o==="issue")return fn(h,n);if(o==="pull_request")return an(h,n);if(o==="direct")return on(h);throw Error(`Unknown INFER_CONTEXT_KIND "${o}" (expected "issue", "pull_request", or "direct")`)}function ah(h){let n=h.INFER_CONTEXT_KIND;if(n==="direct")return{kind:"direct",prompt:(h.INFER_DIRECT_PROMPT??"").trim()||"(dry-run: no prompt)"};if(n==="pull_request"){let o=ih(h),f=o?N(h):void 0;return{kind:"pull_request",prNumber:Number.parseInt(h.INFER_ISSUE_NUMBER??"0",10)||0,prTitle:"(dry-run: PR title unavailable)",prBody:"",headRef:"(unknown)",baseRef:"main",headRepoFullName:"",isFork:!1,prState:"open",triggeringCommentId:f?.id??0,comments:f?[{id:f.id,author:f.author,body:f.body,createdAt:"",isTrigger:!0}]:[],...o?{reviewComment:o}:{}}}return{kind:"issue",issueNumber:Number.parseInt(h.INFER_ISSUE_NUMBER??"0",10)||0,issueTitle:h.INFER_ISSUE_TITLE??"",issueBody:h.INFER_ISSUE_BODY??""}}function on(h){let n=(h.INFER_DIRECT_PROMPT??"").trim();if(!n)throw Error("Missing or empty INFER_DIRECT_PROMPT for direct context");return{kind:"direct",prompt:n}}async function fn(h,n){let o=Number.parseInt(h.INFER_ISSUE_NUMBER??"",10);if(!Number.isFinite(o))throw Error("Missing or invalid INFER_ISSUE_NUMBER");let f=h.INFER_ISSUE_TITLE??"",w=h.INFER_ISSUE_BODY??"",u=N(h),[{associatedPrs:a,associatedBranches:i},k]=await Promise.all([un(n,o),wn(n,o,u?.id??0)]);return{kind:"issue",issueNumber:o,issueTitle:f,issueBody:w,...u?{triggeringComment:u}:{},...a.length?{associatedPrs:a}:{},...i.length?{associatedBranches:i}:{},...k.length?{threadComments:k}:{}}}async function wn(h,n,o){try{return(await h.listIssueComments(n)).map((w)=>({id:w.id,author:w.author,body:w.body,createdAt:w.createdAt,isTrigger:o>0&&w.id===o}))}catch(f){return console.warn(`[context] failed to list comments for issue #${n}; proceeding without the thread:`,f instanceof Error?f.message:f),[]}}async function un(h,n){let o=`fix/issue-${n}`;try{let[f,w]=await Promise.all([h.getOpenPrForBranch(o),h.findPrsReferencingIssue(n)]),u=new Map;for(let k of w)u.set(k.number,k);if(f){let k=u.get(f.number);u.set(f.number,{number:f.number,url:k?.url||f.url,state:k?.state||"open",headRef:o,baseRef:f.baseRef,isDraft:k?.isDraft??!1,title:k?.title??""})}return{associatedPrs:[...u.values()],associatedBranches:f?[o]:[]}}catch(f){return console.warn(`[context] failed to gather existing work for issue #${n}; proceeding without it:`,f instanceof Error?f.message:f),{associatedPrs:[],associatedBranches:[]}}}async function an(h,n){let o=Number.parseInt(h.INFER_ISSUE_NUMBER??"",10);if(!Number.isFinite(o))throw Error("Missing or invalid INFER_ISSUE_NUMBER for PR context");let f=Number.parseInt(h.INFER_TRIGGERING_COMMENT_ID??"",10),w=Number.isFinite(f)?f:0,u=ih(h),[a,i]=await Promise.all([n.getPullRequest(o),u?kn(h,n,o,w):n.listIssueComments(o).then((O)=>O.map((Z)=>({id:Z.id,author:Z.author,body:Z.body,createdAt:Z.createdAt,isTrigger:w>0&&Z.id===w})))]),k=`${n.owner}/${n.repoName}`,Y=a.headRepoFullName!==""&&a.headRepoFullName!==k;return{kind:"pull_request",prNumber:o,prTitle:a.title,prBody:a.body,headRef:a.headRef,baseRef:a.baseRef,headRepoFullName:a.headRepoFullName,isFork:Y,prState:a.state,triggeringCommentId:w,comments:yn(i,h),...u?{reviewComment:u}:{}}}function ih(h){let n=(h.INFER_REVIEW_COMMENT_PATH??"").trim();if(!n)return;let o=Number.parseInt(h.INFER_REVIEW_COMMENT_LINE??"",10),f=Number.parseInt(h.INFER_REVIEW_COMMENT_START_LINE??"",10);return{path:n,diffHunk:h.INFER_REVIEW_COMMENT_DIFF_HUNK??"",...Number.isFinite(o)?{line:o}:{},...Number.isFinite(f)?{startLine:f}:{}}}async function kn(h,n,o,f){let w=Number.parseInt(h.INFER_REVIEW_COMMENT_IN_REPLY_TO??"",10),u=[];if(Number.isFinite(w)&&w>0){let a=await n.listReviewComments(o);for(let i of a)if(i.id===w||i.inReplyToId===w)u.push({id:i.id,author:i.author,body:i.body,createdAt:i.createdAt,isTrigger:f>0&&i.id===f})}return u}function yn(h,n){if(h.some((f)=>f.isTrigger))return h;let o=N(n);return o?[...h,{...o,createdAt:"",isTrigger:!0}]:h}function N(h){let n=h.INFER_TRIGGERING_COMMENT_ID??"",o=h.INFER_TRIGGERING_COMMENT_BODY??"",f=h.INFER_TRIGGERING_COMMENT_AUTHOR??"",w=Number.parseInt(n,10);if(!Number.isFinite(w)||w<=0)return;if(!o.trim())return;return{id:w,body:o,author:f}}class E{token;baseUrl;fetchImpl;constructor(h){this.token=h.token,this.baseUrl=(h.baseUrl||process.env.GITHUB_API_URL||"https://api.github.com").replace(/\/+$/,""),this.fetchImpl=h.fetchImpl??fetch}issues={getComment:(h)=>this.request("GET",`/repos/${h.owner}/${h.repo}/issues/comments/${h.comment_id}`),updateComment:(h)=>this.request("PATCH",`/repos/${h.owner}/${h.repo}/issues/comments/${h.comment_id}`,void 0,{body:h.body}),createComment:(h)=>this.request("POST",`/repos/${h.owner}/${h.repo}/issues/${h.issue_number}/comments`,void 0,{body:h.body}),listComments:(h)=>this.request("GET",`/repos/${h.owner}/${h.repo}/issues/${h.issue_number}/comments`,{per_page:h.per_page,page:h.page}),listEventsForTimeline:(h)=>this.request("GET",`/repos/${h.owner}/${h.repo}/issues/${h.issue_number}/timeline`,{per_page:h.per_page})};pulls={list:(h)=>this.request("GET",`/repos/${h.owner}/${h.repo}/pulls`,{head:h.head,state:h.state,per_page:h.per_page}),get:(h)=>this.request("GET",`/repos/${h.owner}/${h.repo}/pulls/${h.pull_number}`),create:(h)=>this.request("POST",`/repos/${h.owner}/${h.repo}/pulls`,void 0,{head:h.head,base:h.base,title:h.title,body:h.body,draft:h.draft}),listComments:(h)=>this.request("GET",`/repos/${h.owner}/${h.repo}/pulls/${h.pull_number}/comments`,{per_page:h.per_page,page:h.page}),update:(h)=>this.request("PATCH",`/repos/${h.owner}/${h.repo}/pulls/${h.pull_number}`,void 0,{body:h.body}),getComment:(h)=>this.request("GET",`/repos/${h.owner}/${h.repo}/pulls/comments/${h.comment_id}`),updateComment:(h)=>this.request("PATCH",`/repos/${h.owner}/${h.repo}/pulls/comments/${h.comment_id}`,void 0,{body:h.body}),createReview:(h)=>this.request("POST",`/repos/${h.owner}/${h.repo}/pulls/${h.pull_number}/reviews`,void 0,{event:h.event,body:h.body,comments:h.comments})};checks={listForRef:(h)=>this.request("GET",`/repos/${h.owner}/${h.repo}/commits/${h.ref}/check-runs`,{per_page:h.per_page??100})};repos={get:(h)=>this.request("GET",`/repos/${h.owner}/${h.repo}`),createOrUpdateFileContents:(h)=>this.request("PUT",`/repos/${h.owner}/${h.repo}/contents/${h.path}`,void 0,{message:h.message,content:h.content,branch:h.branch})};git={getRef:(h)=>this.request("GET",`/repos/${h.owner}/${h.repo}/git/ref/${h.ref}`),createRef:(h)=>this.request("POST",`/repos/${h.owner}/${h.repo}/git/refs`,void 0,{ref:h.ref,sha:h.sha}),createCommit:(h)=>this.request("POST",`/repos/${h.owner}/${h.repo}/git/commits`,void 0,{message:h.message,tree:h.tree})};async request(h,n,o,f){let w=`${this.baseUrl}${n}`;if(o){let i=new URLSearchParams;for(let[k,Y]of Object.entries(o))i.set(k,String(Y));w+=`?${i.toString()}`}let u={Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","User-Agent":"infer-action"};if(this.token)u.Authorization=`Bearer ${this.token}`;if(f!==void 0)u["Content-Type"]="application/json";let a=await this.fetchImpl(w,{method:h,headers:u,...f!==void 0?{body:JSON.stringify(f)}:{}});if(!a.ok){let i=await a.text().catch(()=>"");throw Error(`GitHub API ${h} ${n} -> ${a.status} ${a.statusText}: ${i.slice(0,300)}`)}if(a.status===204)return{data:void 0};return{data:await a.json()}}}var qn=20;function kh(h){return h.replace(/`/g,"")}var z="<!-- infer:plan-end -->",P="<!-- infer:result-start -->",s="infer-artifacts",Wn="4b825dc642cb6eb9a060e54bf8d69288fbee4904",yh="<!-- infer:spinner -->",l="<!-- /infer:spinner -->",qh=`${yh}<img src="https://raw.githubusercontent.com/inference-gateway/infer-action/main/assets/spinner.svg" width="22" height="22" alt="Working" />${l}`;function Yn(h){let n=h.indexOf(yh);if(n===-1)return h;let o=h.indexOf(l,n);if(o===-1)return h;let f=o+l.length;while(f<h.length&&(h[f]===`
`||h[f]==="\r"))f++;return h.slice(0,n)+h.slice(f)}function $n(h){let n=h.indexOf(z),o=h.indexOf(P);if(n===-1&&o===-1)return{plan:h,middle:"",result:""};if(n===-1)return{plan:h.slice(0,o),middle:"",result:h.slice(o+P.length)};if(o===-1)return{plan:h.slice(0,n),middle:h.slice(n+z.length),result:""};return{plan:h.slice(0,n),middle:h.slice(n+z.length,o),result:h.slice(o+P.length)}}function Rn(h){let n=h.plan.trim(),o=h.middle.trim(),f=h.result.trim();if(!o&&!f)return n;let w=n;if(w+=`

${z}`,o)w+=`

${o}`;if(w+=`

${P}`,f)w+=`

${f}`;return w}class A{api;redactor;dryRun;reviewComment;artifactsBranchEnsured=!1;owner;repoName;constructor(h){this.api=h.api??new E({token:h.token}),this.redactor=h.redactor,this.dryRun=h.dryRun??!1,this.reviewComment=h.reviewComment??!1;let[n,o]=h.repo.split("/");if(!n||!o)throw Error(`Invalid repo string "${h.repo}", expected "owner/name"`);this.owner=n,this.repoName=o}commentUrl(h){return`https://github.com/${this.owner}/${this.repoName}/issues/comments/${h}`}issueUrl(h){return`https://github.com/${this.owner}/${this.repoName}/issues/${h}`}prUrl(h){return`https://github.com/${this.owner}/${this.repoName}/pull/${h}`}async getCommentBody(h){return(await(this.reviewComment?this.api.pulls:this.api.issues).getComment({owner:this.owner,repo:this.repoName,comment_id:h})).data.body??""}async updateCommentBody(h,n){let o=this.redactor?this.redactor.redact(n):n;if(this.dryRun){console.log(`[dry-run] would update comment #${h} (${this.commentUrl(h)}):
${o}`);return}await(this.reviewComment?this.api.pulls:this.api.issues).updateComment({owner:this.owner,repo:this.repoName,comment_id:h,body:o})}async createIssueComment(h,n){let o=this.redactor?this.redactor.redact(n):n;if(this.dryRun){console.log(`[dry-run] would create a github issue comment on issue #${h} (${this.issueUrl(h)}):
${o}`);return}await this.api.issues.createComment({owner:this.owner,repo:this.repoName,issue_number:h,body:o})}async updateZone(h,n,o){if(this.dryRun){let u=this.redactor?this.redactor.redact(o):o;console.log(`[dry-run] would update the ${n} zone of comment #${h} (${this.commentUrl(h)}):
${u}`);return}let f=await this.getCommentBody(h),w=$n(f);w[n]=o,await this.updateCommentBody(h,Rn(w))}async clearSpinner(h){if(this.dryRun){console.log(`[dry-run] would clear the spinner on comment #${h} (${this.commentUrl(h)})`);return}let n=await this.getCommentBody(h),o=Yn(n);if(o===n)return;await this.updateCommentBody(h,o)}async getOpenPrForBranch(h){let o=(await this.api.pulls.list({owner:this.owner,repo:this.repoName,head:`${this.owner}:${h}`,state:"open",per_page:1})).data[0];if(!o)return null;return{number:o.number,url:o.html_url,body:o.body??"",baseRef:o.base.ref}}async getPrForBranch(h){let n=await this.api.pulls.list({owner:this.owner,repo:this.repoName,head:`${this.owner}:${h}`,state:"all",per_page:20}),o=(a)=>({number:a.number,url:a.html_url,body:a.body??"",baseRef:a.base.ref,state:a.state==="open"?"open":"closed",merged:a.merged_at!=null}),f=n.data.find((a)=>a.state==="open");if(f)return o(f);let w=n.data.find((a)=>a.merged_at!=null);if(w)return o(w);let u=n.data[0];return u?o(u):null}async findPrsReferencingIssue(h){let o=(await this.api.issues.listEventsForTimeline({owner:this.owner,repo:this.repoName,issue_number:h,per_page:100})).data,f=new Map;for(let w of o){if(w.event!=="cross-referenced")continue;let u=w.source?.issue;if(!u||!u.pull_request||typeof u.number!=="number")continue;f.set(u.number,{number:u.number,url:u.html_url??"",state:u.state??"",headRef:"",baseRef:"",isDraft:u.draft??!1,title:u.title??""})}return[...f.values()]}async updatePullRequestBody(h,n){let o=this.redactor?this.redactor.redact(n):n;if(this.dryRun){console.log(`[dry-run] would update PR #${h} body (${this.prUrl(h)}):
${o}`);return}await this.api.pulls.update({owner:this.owner,repo:this.repoName,pull_number:h,body:o})}async createDraftPr(h){let n=this.redactor?this.redactor.redact(h.body):h.body;if(this.dryRun)return console.log(`[dry-run] would open a DRAFT PR ${h.head} -> ${h.base} titled "${h.title}":
${n}`),{number:0,url:"(dry-run)",body:n,baseRef:h.base};let o=await this.api.pulls.create({owner:this.owner,repo:this.repoName,head:h.head,base:h.base,title:h.title,body:n,draft:!0});return{number:o.data.number,url:o.data.html_url,body:o.data.body??"",baseRef:o.data.base.ref}}async uploadArtifactImage(h,n,o){let f=`${h}/${encodeURIComponent(n)}`,w=`https://raw.githubusercontent.com/${this.owner}/${this.repoName}/${s}/${h}/${encodeURIComponent(n)}`;if(this.dryRun)return console.log(`[dry-run] would upload artifact image ${n} to branch ${s} at ${f}`),w;try{return await this.ensureArtifactsBranch(),(await this.api.repos.createOrUpdateFileContents({owner:this.owner,repo:this.repoName,path:f,message:`chore: add run artifact ${n} (run ${h})`,content:Buffer.from(o).toString("base64"),branch:s})).data.content?.download_url||w}catch(u){return console.error(`artifact image upload failed for ${n}:`,u),null}}async ensureArtifactsBranch(){if(this.artifactsBranchEnsured)return;try{await this.api.git.getRef({owner:this.owner,repo:this.repoName,ref:`heads/${s}`}),this.artifactsBranchEnsured=!0;return}catch{}let h=await this.api.git.createCommit({owner:this.owner,repo:this.repoName,message:`chore: initialize ${s} branch for run artifacts`,tree:Wn});await this.api.git.createRef({owner:this.owner,repo:this.repoName,ref:`refs/heads/${s}`,sha:h.data.sha}),this.artifactsBranchEnsured=!0}async createReview(h){if(this.dryRun){console.log(`[dry-run] would submit a ${h.event} review on #${h.pullNumber} with ${h.comments.length} inline comment(s)`);return}await this.api.pulls.createReview({owner:this.owner,repo:this.repoName,pull_number:h.pullNumber,event:h.event,body:h.body,comments:h.comments})}async getDefaultBranch(){return(await this.api.repos.get({owner:this.owner,repo:this.repoName})).data.default_branch}async getPullRequest(h){let n=await this.api.pulls.get({owner:this.owner,repo:this.repoName,pull_number:h});return{title:n.data.title,body:n.data.body??"",headRef:n.data.head.ref,headRepoFullName:n.data.head.repo?.full_name??"",baseRef:n.data.base.ref,state:n.data.merged_at?"merged":n.data.state==="open"?"open":"closed"}}async listIssueComments(h){let n=[],o=2;for(let f=1;f<=2;f++){let w=await this.api.issues.listComments({owner:this.owner,repo:this.repoName,issue_number:h,per_page:100,page:f});for(let u of w.data)n.push({id:u.id,author:u.user?.login??"unknown",body:u.body??"",createdAt:u.created_at});if(w.data.length<100)break}return n}async listReviewComments(h){let n=[],o=2;for(let f=1;f<=2;f++){let w=await this.api.pulls.listComments({owner:this.owner,repo:this.repoName,pull_number:h,per_page:100,page:f});for(let u of w.data)n.push({id:u.id,author:u.user?.login??"unknown",body:u.body??"",createdAt:u.created_at,inReplyToId:u.in_reply_to_id??0});if(w.data.length<100)break}return n}async getPrCheckRuns(h){try{let o=(await this.api.checks.listForRef({owner:this.owner,repo:this.repoName,ref:h})).data.check_runs;if(o.length===0)return"";let f=o.filter((a)=>a.conclusion==="failure"||a.conclusion==="timed_out"||a.conclusion==="action_required"),w=o.filter((a)=>a.status!=="completed"),u=[];for(let a of f){u.push(`- **${kh(a.name)}**: ${a.conclusion}`);let i=a.output?.summary?.trim()||a.output?.text?.trim()||"";if(i){let k=i.split(`
`).slice(0,qn).join(`
`).slice(0,2000);u.push("  ```"),u.push(k),u.push("  ```")}}if(w.length>0)u.push(`- **${w.length} pending check(s)**: ${w.map((a)=>kh(a.name)).join(", ")}`);if(u.length===0)return"";return`## CI Checks

${u.join(`
`)}`}catch(n){return console.warn(`[github] failed to fetch check runs for ref ${h}:`,n instanceof Error?n.message:n),""}}}var I=["GITHUB_TOKEN","OLLAMA_CLOUD_API_KEY","GROQ_API_KEY","LLAMACPP_API_KEY","OPENAI_API_KEY","CLOUDFLARE_API_KEY","COHERE_API_KEY","ANTHROPIC_API_KEY","DEEPSEEK_API_KEY","GOOGLE_API_KEY","MISTRAL_API_KEY","MINIMAX_API_KEY","MOONSHOT_API_KEY","NVIDIA_API_KEY","ZAI_API_KEY","OTEL_EXPORTER_OTLP_HEADERS","MEMORY_TOKEN","MEMORY_DEPLOY_KEY"],On=["-----BEGIN [A-Z ]*PRIVATE KEY( BLOCK)?-----[\\s\\S]+?-----END [A-Z ]*PRIVATE KEY( BLOCK)?-----"],Kn=["github_pat_[A-Za-z0-9_]{82,}","gh[pours]_[A-Za-z0-9]{36,}","AIza[0-9A-Za-z_-]{35}","xox[bpoa]-[A-Za-z0-9-]{20,}","sk-[A-Za-z0-9_-]{20,}","eyJ[A-Za-z0-9_-]+\\.eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]{10,}"];var Jn=/[.*+?^${}()|[\]\\]/g;function _(h,n,o=8){let f=[],w=new Set;for(let u of n){let a=h[u];if(typeof a!=="string")continue;if(a.trim().length<o)continue;if(w.has(a))continue;w.add(a),f.push(a)}return f}function Wh(h){let n=new Set;for(let o of h){if(!o||n.has(o))continue;n.add(o),process.stdout.write(`::add-mask::${o}
`)}}function Yh(h={}){let n=h.placeholder??"***",o=h.minLength??8,f=h.env??process.env,w=h.heuristics??!1,u=_(f,I,o);u.sort((k,Y)=>Y.length-k.length);let a=u.map(Zn);if(a.push(...On),w)a.push(...Kn);let i=a.length>0?new RegExp(a.join("|"),"g"):null;return{secretCount:u.length,redact(k){if(!i||!k)return k;return k.replace(i,n)}}}function Zn(h){return h.replace(Jn,"\\$&")}var F="/tmp/agent-output.txt",S="/tmp/infer-todos.json",g="/tmp/infer-cancelled",$h="/tmp/infer-gateway-version";function G(h){let n=process.env[h];if(!n)throw Error(`Missing required env var ${h}`);return n}function q(h){return process.env[h]??""}function Rh(){let h=q("INFER_DRY_RUN")==="true",n=h?q("GITHUB_TOKEN"):G("GITHUB_TOKEN"),o=G("INFER_REPO"),f=q("INFER_ENABLE_GIT_OPERATIONS")!=="false",w=q("INFER_REDACT_HEURISTICS")==="true",u=_(process.env,I);Wh(u);let a=Yh({env:process.env,heuristics:w}),i=q("INFER_COOKING_COMMENT_IS_REVIEW")==="true",k=new A({token:n,repo:o,redactor:a,dryRun:h,reviewComment:i});return{dryRun:h,token:n,repo:o,enableGitOps:f,enableHeuristics:w,redactor:a,github:k}}async function Oh(h,n,o){try{return await uh(h,n)}catch(f){if(o.failHard)throw f;return console.warn(`[${o.stepName}] context read failed (${f.message}); proceeding with env-derived data`),ah(h)}}var Qn=3000,Dn=300000,Xn=2000;async function Jh(h,n,o={}){let f=o.readConfig?o.readConfig():Fn(h,n);if(!f)return"";let w=await zn(f.url,o.fetcher??fetch,o.intervalMs,o.deadlineMs);if(w)return w;if(!f.run)return"";if(f.oci&&!f.standaloneBinary)return Gn(f.oci);return o.binaryVersion?o.binaryVersion():Vn()}async function zn(h,n=fetch,o=Qn,f=Dn){let w=`${h.replace(/\/+$/,"")}/version`,u=Date.now()+f;for(;;){try{let a=await n(w,{signal:AbortSignal.timeout(Xn)});if(a.ok){let i=Pn(await a.text());if(i)return i}}catch{}if(Date.now()+o>=u)return"";await new Promise((a)=>setTimeout(a,o).unref())}}function Pn(h){try{let n=JSON.parse(h);if(n&&typeof n==="object"&&typeof n.version==="string")return L(n.version)}catch{}return L(h)}function L(h){let n=h.trim().replace(/^v/,""),o=n[0]??"";if(n===""||n.length>32||o<"0"||o>"9")return"";return/^[0-9A-Za-z.+-]+$/.test(n)?n:""}function Gn(h){let n=h.slice(h.lastIndexOf("/")+1),o=n.indexOf(":");if(o>=0)n=n.slice(o+1);return L(n)}function Fn(h,n){let o=U(h,n,"gateway.url");if(!o)return null;let f=(w)=>/^(true|1)$/i.test(U(h,n,w));return{url:o,run:U(h,n,"gateway.run")===""||f("gateway.run"),oci:U(h,n,"gateway.oci"),standaloneBinary:f("gateway.standalone_binary")}}function U(h,n,o){try{let f=Kh(h,["config","get",o],{env:n,encoding:"utf8",timeout:15000,stdio:["ignore","pipe","pipe"]});if(f.status!==0)return"";return Un((f.stdout??"").trim())}catch{return""}}function Un(h){let n=h[0]??"",o=h[h.length-1]??"";if(h.length>=2&&(n==='"'||n==="'")&&n===o)return h.slice(1,-1);return h}function Ln(h=sn()){let n=process.platform==="win32"?"inference-gateway.exe":"inference-gateway";return Hn(h,".infer","bin",n)}function Vn(h=Kh,n=Ln()){try{let o=h(n,["--version"],{encoding:"utf8",timeout:5000,stdio:["ignore","pipe","pipe"]}),f=(o.stdout??"").trim().split(/\s+/).filter(Boolean);if(o.status!==0)return"";return L(f[f.length-1]??"")}catch{return""}}function Zh(h){try{jn($h,h)}catch(n){console.error("[gateway] failed to persist gateway version:",n)}}function jh(h,n,o=""){return{model:n,actionVersion:h.INFER_ACTION_VERSION??"",cliVersion:h.INFER_CLI_VERSION??"",gatewayVersion:o,workflowUrl:h.INFER_WORKFLOW_URL??""}}function sh(h){return[`**Model:** \`${h.model}\``,h.actionVersion?`**Action:** ${Tn(h.actionVersion)}`:"",h.cliVersion?`**CLI:** \`${h.cliVersion}\``:"",h.gatewayVersion?`**Gateway:** \`${Mn(h.gatewayVersion)}\``:"",h.workflowUrl?`[View Job](${h.workflowUrl})`:""].filter(Boolean).join(" \xB7 ")}function Mn(h){let n=h[0]??"";return n>="0"&&n<="9"?`v${h}`:h}function Tn(h){let n=/^[0-9a-f]{40}$/.test(h)?`https://github.com/inference-gateway/infer-action/commit/${h}`:`https://github.com/inference-gateway/infer-action/releases/tag/${h}`;return`[\`${h}\`](${n})`}var Hh=(h)=>/^(true|1)$/i.test((h??"").trim());function Qh(h){let n=(h.INFER_MIRROR_AGENT_LOGS??"").trim();return{stdout:n!==""?Hh(n):Hh(h.INFER_LOGGING_DEBUG),stderr:!0}}import Bn from"readline";async function*Xh(h){let n=Bn.createInterface({input:h,crlfDelay:1/0}),o=null;for await(let f of n){if(o){if(o.push(f),f==="}"){let a=Dh(o.join(`
`));if(o=null,a)yield a}continue}let w=f.trim();if(!w)continue;if(w==="{"){o=[w];continue}if(w[0]!=="{")continue;let u=Dh(w);if(u)yield u}}function Dh(h){try{let n=JSON.parse(h);if(typeof n!=="object"||n===null)return null;let{role:o,type:f}=n;if(typeof o==="string"||f==="session_stats"||f==="compaction_started"||f==="compaction_completed")return n;return null}catch{return null}}var zh={SYSTEM_DIRECT:`# Infer Agent (manual run)

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

{{ciChecksSection}}

Run \`git diff origin/{{baseRef}}...HEAD\` for the full diff and \`git log origin/{{baseRef}}..HEAD\` for the commit history.{{triggerSection}}`};function Nn(h){let n=process.env[`INFER_PROMPT_OVERRIDE_${h}`];return n&&n.trim()?n:zh[h]}function En(h){let n=process.env[`INFER_PROMPT_OVERRIDE_${h}`];return n&&n.trim()?n:null}var ln={SYSTEM_ISSUE:["git commit","git push","gh pr create","gh pr ready","git status"],SYSTEM_DIRECT:["git commit","git push","gh pr create","gh pr ready","git status"],SYSTEM_PR:["git commit","git push","git status"],SYSTEM_PR_FORK:["git commit","git push"]};function An(h){if(h.kind==="issue")return"SYSTEM_ISSUE";if(h.kind==="direct")return"SYSTEM_DIRECT";if(h.isFork)return"SYSTEM_PR_FORK";return"SYSTEM_PR"}function Ph(h){let n=An(h),o=En(n);if(o===null)return[];let f=ln[n];if(!f||f.length===0)return[];let w=f.filter((u)=>!o.includes(u));return w.length>0?[{key:n,missing:w}]:[]}function J(h,n={}){return Nn(h).replace(/\{\{(\w+)\}\}/g,(o,f)=>{if(!(f in n))throw Error(`Missing variable "${f}" for prompt "${h}"`);return String(n[f])})}function Gh(h,n={}){if(h.kind==="issue")return rn(h);if(h.kind==="direct")return Cn(h);return bn(h,n.diffStat??"",n.ciChecksSection??"")}var In=`## A2A Agents

Delegated A2A tasks run in the background and you are notified automatically when they complete. Submit each task exactly once with A2A_SubmitTask, then WAIT for the completion notification - never resubmit the same task or poll for it in a loop. Only retry a submission if the submission call itself failed (e.g. the agent container was still starting).`,_n='## Images in the conversation\n\nIssue/PR text may embed images (`![...](url)` or `<img src="...">`) - screenshots, error dialogs, diagrams. These often carry the crux of the request, so read them BEFORE starting work: download each with WebFetch (`download=true`), then run ImageDecode on the saved file path, passing a `prompt` asking for what you need (e.g. the exact error text, the UI elements shown). If a download fails (private-repo attachments may be inaccessible), say so in your final response and continue with the text.',Sn='## Inline review mode\n\nWhen review-inline is enabled, the runner submits your review as a real GitHub\npull request review with inline, line-anchored comments. ALWAYS end your final\nmessage with a fenced JSON block carrying your verdict and structured findings,\neven when there are no findings:\n\n````json:findings\n{\n  "verdict": "comment",\n  "findings": [\n    {\n      "path": "src/parser.ts",\n      "line": 42,\n      "side": "RIGHT",\n      "start_line": 40,\n      "body": "Off-by-one on the loop bound.\\n\\n```suggestion\\nfor (let i = 0; i < n; i++) {\\n```"\n    }\n  ]\n}\n````\n\nSet `"verdict": "approve"` only when the PR is ready to merge as-is and\n`findings` is empty; otherwise use `"comment"`. An approve verdict is\nsubmitted as an approval (or as a comment review on a PR you opened yourself).\n\nEach finding must reference a file and line that exists in the PR diff.\nUse `side: "RIGHT"` for new code, `"LEFT"` for the base. For multi-line\ncomments include `start_line` and `start_side`. The `body` can carry\n```suggestion blocks the PR author can apply with one click. The runner\nstrips this block from the summary comment, so your prose above it is still\nvisible there.';function Fh(h,n){let o=gn(h);if(process.env.INFER_A2A_ENABLED==="true")o=`${o}

${In}`;if(process.env.INFER_VISION_ANNOTATOR_ENABLED==="true")o=`${o}

${_n}`;if(h.kind==="pull_request"&&process.env.INFER_REVIEW_MODE==="true"&&process.env.INFER_REVIEW_INLINE==="true")o=`${o}

${Sn}`;if(n.trim())return`${o}

## Additional Instructions

${n}`;return o}function gn(h){if(h.kind==="issue")return J("SYSTEM_ISSUE",{issueNumber:h.issueNumber});if(h.kind==="direct")return J("SYSTEM_DIRECT");if(h.isFork)return J("SYSTEM_PR_FORK",{prNumber:h.prNumber,headRef:h.headRef,headRepoFullName:h.headRepoFullName,baseRef:h.baseRef});return J("SYSTEM_PR",{prNumber:h.prNumber,headRef:h.headRef,baseRef:h.baseRef})}function Cn(h){return J("TASK_DIRECT",{prompt:h.prompt})}function rn(h){let n=h.triggeringComment?`

## Triggering comment from @${h.triggeringComment.author}

${h.triggeringComment.body}

Treat this comment as the user's most recent intent. If it asks for something more specific than the issue body, prioritise it.`:"";return J("TASK_ISSUE",{issueNumber:h.issueNumber,issueTitle:h.issueTitle,issueBody:h.issueBody,existingWorkSection:vn(h),recentCommentsSection:Uh((h.threadComments??[]).filter((o)=>!o.isTrigger),"Recent comments (chronological)"),triggeringCommentSection:n})}function Uh(h,n){let o=h.filter((a)=>!a.author.endsWith("[bot]")),f=o.slice(-3);if(f.length===0)return"";let w=o.length-f.length,u=w>0?`_\u2026${w} earlier comment${w===1?"":"s"} omitted_

`:"";return`

## ${n}

${u}${f.map(Lh).join(`

`)}`}function vn(h){let n=h.associatedPrs??[],o=h.associatedBranches??[];if(n.length===0&&o.length===0)return"";let f=["## Existing work for this issue","A prior run or another contributor may already have started on this issue. Before creating a branch, inspect the items below and CONTINUE from them if they contain relevant work - check it out (`gh pr checkout <number>`, or `git fetch origin <branch> && git checkout <branch>`) and build on top of it rather than starting fresh. Only start a new branch if none of these apply."];if(n.length){let w=n.map((u)=>{let a=u.isDraft?" (draft)":"",i=u.state&&u.state!=="open"?` [${u.state}]`:"",k=u.headRef?` - branch \`${u.headRef}\``:"",Y=u.title?` - ${u.title}`:"";return`- PR #${u.number}${a}${i}${k}: ${u.url}${Y}`});f.push(`### Pull requests

`+w.join(`
`))}if(o.length)f.push(`### Branches

`+o.map((w)=>`- \`${w}\``).join(`
`));return`

`+f.join(`

`)}function bn(h,n,o){let f=h.isFork?`
Head lives in a fork: ${h.headRepoFullName}. You CANNOT push commits to it from this runner.`:"";if(h.prState!=="open")f+=`
This PR is already ${h.prState}. Its head branch may have been deleted, and the checkout is likely on the default branch. Treat the request as follow-up work: if it needs no code changes (e.g. filing a follow-up issue), just do that; if it needs code changes, create a NEW branch off ${h.baseRef} and open a new PR - never push to the old head branch.`;let w=h.comments.find((O)=>O.isTrigger),u=w?`

## Triggering comment from @${w.author} (id: ${w.id})

${w.body}

This is the user's most recent ask. Address it directly. Do not re-implement existing changes unless this comment asks for that.`:"",a=h.comments.filter((O)=>!O.isTrigger);if(h.reviewComment)return dn(h,h.reviewComment,{forkNotice:f,triggerSection:u,others:a});let i=Uh(a,"Other comments (chronological)"),k=h.prBody.trim()?h.prBody:"_(no description)_",Y=n.trim()?"```\n"+n.trim()+"\n```":"_(no changes on this branch yet)_";return J("TASK_PR",{prNumber:h.prNumber,prTitle:h.prTitle,headRef:h.headRef,baseRef:h.baseRef,forkNotice:f,prBody:k,triggerSection:u,otherCommentsSection:i,diffStatSection:Y,ciChecksSection:o})}function dn(h,n,o){let f=n.startLine&&n.line&&n.startLine!==n.line?`, lines ${n.startLine}-${n.line}`:n.line?`, line ${n.line}`:"",w=o.others.length>0?`

## Earlier comments in this review thread

${o.others.map(Lh).join(`

`)}`:"";return J("TASK_PR_REVIEW",{prNumber:h.prNumber,prTitle:h.prTitle,headRef:h.headRef,baseRef:h.baseRef,forkNotice:o.forkNotice,filePath:n.path,lineInfo:f,diffHunk:n.diffHunk,threadSection:w,triggerSection:o.triggerSection})}function Lh(h){return`**@${h.author}** \xB7 ${h.createdAt}

${h.body}`}function en(h){if(!Number.isFinite(h)||h<=0)return 10;return Math.max(10,Math.round(h*0.1))}function mn(h){return Math.max(1,Math.floor(h*0.8))}function tn(h){if(h.kind==="direct")return h.prompt;if(h.kind==="issue")return h.triggeringComment?.body??`${h.issueTitle}
${h.issueBody}`;return h.comments.find((n)=>n.isTrigger)?.body??`${h.prTitle}
${h.prBody}`}function Mh(h){return/\bdemo(s|nstrat\w*)?\b/i.test(tn(h))}function cn(h,n){let o=[],f=n.enableGitOps&&!(h.kind==="pull_request"&&h.isFork);if(o.push({name:"infer-action-context",hook:"pre_stream",trigger:"interval",interval:5,text:n.enableGitOps?xn(h):"<system-reminder>Keep your TodoWrite plan current as you go. Only answering a question? Ignore this.</system-reminder>"}),f){if(o.push({name:"infer-action-wrap-up",hook:"pre_stream",trigger:"turns_before_max",threshold:en(n.maxTurns??0),text:Vh(h)}),n.maxDurationMinutes&&n.maxDurationMinutes>0)o.push({name:"infer-action-wrap-up-time",hook:"pre_stream",trigger:"elapsed_minutes",threshold:mn(n.maxDurationMinutes),text:Vh(h,"time budget")});o.push({name:"infer-action-failed-tool",hook:"post_tool",trigger:"on_failure",text:ho()})}if(n.recordDemo)o.push({name:"infer-action-record-demo",hook:"pre_stream",trigger:"once",text:pn()});return o}function xn(h){if(h.kind==="pull_request"&&h.isFork)return"<system-reminder>This PR is from a fork - you CANNOT commit or push. Investigate with file reads and git diff, then answer the user's question or summarise. Keep your TodoWrite plan current.</system-reminder>";if(h.kind==="pull_request")return`<system-reminder>Keep your TodoWrite plan current. If you changed files, commit + push after each step so PR #${h.prNumber} stays current - unpushed work is lost when the job ends. Only reviewing or answering? Do not change, commit, or push anything.</system-reminder>`;return"<system-reminder>Keep your TodoWrite plan current. Changing code? Work on a pushed branch with an open draft PR (`gh pr create --draft`) and commit + push after each step so nothing is lost - never commit on or push to main. Only answering a question? Ignore this.</system-reminder>"}function Vh(h,n="turn limit"){let o=h.kind==="pull_request"?`so PR #${h.prNumber} is up to date, and update the PR body with a checklist of the remaining todos`:"and make sure the draft PR exists: `gh pr create --draft` with a title like `wip: <short description of the task>` and a body listing the remaining todos and unfinished work, so a human can pick up where you left off";return`<system-reminder>You are close to the ${n}. Stop starting new work - if you have uncommitted or unpushed changes, commit and push them now ${o}. If the repo's checks fail on commit and you cannot fix them before the ${n}, commit with --no-verify as a last resort rather than losing the work. Unpushed work is lost when the run ends. If you changed nothing, just finish your summary.</system-reminder>`}function pn(){return'<system-reminder>The user asked for a demo: load the `demo` skill now and follow it.\nAdd "Record the demo" as your last todo - the recording comes after the work is committed and\npushed, and ends as one GIF in ~/.infer/artifacts.</system-reminder>'}function ho(){return"<system-reminder>That tool call FAILED - the change did NOT happen. Re-read or re-check, fix it, and retry. Never mark a todo done or claim success on a failed call.</system-reminder>"}function no(h){let n=["enabled: true","merge: true","reminders:"];for(let o of h){if(n.push(`  - name: ${JSON.stringify(o.name)}`),n.push(`    hook: ${JSON.stringify(o.hook)}`),n.push(`    trigger: ${JSON.stringify(o.trigger)}`),o.interval!==void 0)n.push(`    interval: ${o.interval}`);if(o.threshold!==void 0)n.push(`    threshold: ${o.threshold}`);n.push(`    text: ${JSON.stringify(o.text)}`)}return n.join(`
`)+`
`}function Th(h,n,o){let f=cn(n,o),w=h.trim();if(!w)return no(f);return oo(w,f)}function oo(h,n){let o=fo(h);if(!o)return`${h}
`;let f=o.reminders??[],w=new Set(f.map((a)=>a.name)),u=[...f,...n.filter((a)=>!w.has(a.name))];return`${JSON.stringify({...o,reminders:u})}
`}function fo(h){let n;try{n=Bun.YAML.parse(h)}catch{return}if(typeof n!=="object"||n===null||Array.isArray(n))return;let o=n.reminders;if(o!=null&&!Array.isArray(o))return;return n}import{execFileSync as wo}from"child_process";import{appendFileSync as Bh,existsSync as wf,readFileSync as uo,rmSync as ao,writeFileSync as io}from"fs";var ko=60000;function Nh(){try{io(g,"1")}catch(h){console.error("[runner] failed to write cancel marker:",h)}}function Eh(){try{ao(g,{force:!0})}catch{}}var C=2,lh=3;function Ah(h,n=r){try{return n(`git diff --stat origin/${yo(h)}...HEAD`)}catch(o){return console.error("[runner] git diff --stat failed:",o),""}}function Ih(h,n=(o)=>o){try{let w=uo(F,"utf8").split(`
`).filter((u)=>u.trim()!=="").slice(-h);if(w.length===0)return;console.error("=========================================="),console.error(`[recover] last ${w.length} line(s) of agent activity before it stopped:`),console.error("------------------------------------------");for(let u of w){let a=u.length>2000?u.slice(0,2000)+" \u2026":u;console.error(n(a))}console.error("==========================================")}catch(o){console.error("[recover] could not read agent transcript for breadcrumb:",o)}}function r(h){return wo("bash",["-c",h],{encoding:"utf8",timeout:ko,env:{...process.env,GIT_TERMINAL_PROMPT:"0"}})}function yo(h){return`'${h.replace(/'/g,"'\\''")}'`}function H(h,n){let o=process.env.GITHUB_OUTPUT;if(!o){console.log(`(would set output) ${h}=${n}`);return}if(n.includes(`
`)){let f=`_GHO_EOF_${Math.random().toString(36).slice(2)}`;Bh(o,`${h}<<${f}
${n}
${f}
`)}else Bh(o,`${h}=${n}
`)}function Sh(h){return typeof h==="object"&&h!==null&&h.role==="tool"&&typeof h.content==="string"}function gh(h){if(typeof h!=="object"||h===null)return!1;let n=h.type;return n==="compaction_started"||n==="compaction_completed"}var _h="Result of tool call: ";function Ch(h){let n=h.startsWith(_h)?h.slice(_h.length):h;if(!n.startsWith("{"))return null;try{let o=JSON.parse(n);if(typeof o==="object"&&o!==null)return o;return null}catch{return null}}class v{handlers=new Map;flushers=[];listeners=[];on(h,n){return this.handlers.set(h,n),this}onMessage(h){return this.listeners.push(h),this}addFlusher(h){return this.flushers.push(h),this}async observe(h){for await(let n of h){for(let w of this.listeners)try{w(n)}catch(u){console.error("[ticker] message listener threw:",u)}if(!Sh(n))continue;let o=Ch(n.content);if(!o?.tool_name)continue;let f=this.handlers.get(o.tool_name);if(!f)continue;try{await f(o,n)}catch(w){console.error(`[ticker] handler for ${o.tool_name} threw:`,w)}}}async flush(){for(let h of this.flushers)try{await h()}catch(n){console.error("[ticker] flusher threw:",n)}}}function rh(h,n){let o=null,f=null,w=null,u=async()=>{if(f=null,!o)return;let a=o.value;o=null,w=h(a).catch((i)=>{console.error("[throttle] fn threw:",i)}).finally(()=>{w=null}),await w};return{call(a){if(o={value:a},!f)f=setTimeout(()=>{u()},n)},async flush(){if(f)clearTimeout(f),f=null;if(o)await u();else if(w)await w}}}function vh(h){let n=Math.floor(h/1000);if(n<60)return`${n}s`;let o=Math.floor(n/60),f=n%60;if(o<60)return`${o}m ${f}s`;let w=Math.floor(o/60),u=o%60;return`${w}h ${u}m ${f}s`}var Ro=1500;async function Oo(){let{dryRun:h,enableGitOps:n,redactor:o,github:f}=Rh(),w=q("INFER_REVIEW_MODE")==="true",u=n&&!w,a=q("INFER_COOKING_COMMENT_ID"),i=a?Number.parseInt(a,10):0,k=Number.isFinite(i)&&i>0,Y=G("INFER_AGENT_MODEL"),O=jh(process.env,Y),Z=q("INFER_CUSTOM_INSTRUCTIONS"),dh=q("INFER_BASH_ALLOW_APPEND"),b=q("INFER_LOGGING_DEBUG")==="true",V=Qh(process.env),$=await Oh(process.env,f,{stepName:"dry-run",failHard:!h});if($.kind==="pull_request"&&(n||w))try{Qo($)}catch(y){if(!h)throw y;console.warn("[dry-run] PR head checkout failed; continuing on the current branch:",y instanceof Error?y.message:y)}let eh=$.kind==="pull_request"?Ah($.baseRef):"",mh=$.kind==="pull_request"?await f.getPrCheckRuns($.headRef):"",d=Fh($,Z),e=Gh($,{diffStat:eh,ciChecksSection:mh});if(u)for(let y of Ph($)){let W=y.key.replace(/^SYSTEM_/,"").toLowerCase().replace(/_/g,"-");process.stdout.write(`::warning::INFER_PROMPT_OVERRIDE_${y.key} replaces the bundled system prompt (system-prompt-${W} / src/prompts/system-${W}.md) and is missing the git-safety markers: ${y.missing.join(", ")}. The default guards against lost work (branch-first, commit-per-todo, push, draft PR, finish checklist); your override dropped those instructions, so the agent may leave changes uncommitted or unpushed. Re-add them to your override, or use the custom-instructions input to layer extras on top of the default instead of replacing it.
`)}let th=q("INFER_REMINDERS_CONFIG"),M=q("INFER_COMPUTER_USE_RECORDING_ENABLED")==="true"&&Mh($),m=Th(th,$,{enableGitOps:u,maxTurns:Number.parseInt(q("INFER_AGENT_MAX_TURNS"),10)||0,recordDemo:M,maxDurationMinutes:Number.parseInt(q("INFER_AGENT_MAX_DURATION_MINUTES"),10)||0}),t=wh(u,dh,M),D=q("INFER_BIN")||"infer",ch=q("INFER_NO_COLOR")==="true",T=Jo(process.env,{systemPrompt:d,bashAllowAppend:t,remindersYaml:m,reviewMode:w,recordDemo:M});console.log("=========================================="),console.log("SYSTEM PROMPT:"),console.log("==========================================");let c=q("INFER_BIN")?void 0:Zo(D,T);if(console.log(c===void 0?d:jo(c,b)),console.log("=========================================="),console.log(""),console.log("Running agent with task:"),console.log(e),console.log("---"),h)console.log("=========================================="),console.log("DRY RUN - the agent would be invoked with:"),console.log("=========================================="),console.log(`Model:        ${Y}`),console.log(`Context kind: ${$.kind}`),console.log(`Git ops:      ${n?"enabled":"disabled"}`),console.log(`Review mode:  ${w?"enabled (Edit/Write/Delete disabled)":"disabled"}`),console.log(`INFER_BIN:    ${D}`),console.log("--- REMINDERS (INFER_REMINDERS_CONFIG) ---"),console.log(m),console.log("--- BASH ALLOW-LIST APPEND (added to the CLI read-only baseline) ---"),console.log(t||"(none - CLI read-only baseline only)"),console.log("==========================================");Po(),Eh();let xh=Date.now(),x=["headless","--format","json-pretty","-m",Y,e];if(ch)x.push("--no-colors");let R=qo(D,x,{stdio:["inherit","pipe","pipe"],env:T});if(!R.stdout||!R.stderr)throw Error("child stdio not piped - this should not happen");let p=!1,hh=!1,nh=(y)=>{if(hh)return;hh=!0,p=!0,Nh(),console.error(`[runner] received ${y}; stopping the agent so the salvage step can recover its work`);try{R.kill("SIGKILL")}catch(W){console.error("[runner] failed to stop agent child:",W)}};process.once("SIGTERM",()=>nh("SIGTERM")),process.once("SIGINT",()=>nh("SIGINT"));let X=Yo(F),oh=new $o;if(R.stdout.pipe(X,{end:!1}),V.stdout)R.stdout.pipe(process.stdout,{end:!1});else console.log("[runner] agent stdout muted (set mirror-agent-logs: true or debug: true to mirror); stderr still shown, full transcript written to /tmp/agent-output.txt");R.stdout.pipe(oh),R.stdout.on("end",()=>X.end()),R.stderr.on("data",(y)=>{if(X.write(y),V.stderr)process.stderr.write(y)});let Q=new v,fh=[],j=k?rh(async(y)=>{let W=so(y,O);try{await f.updateZone(i,"plan",W),console.log(`[ticker] updated plan section (${y.length} todos)`)}catch(ph){console.error("[ticker] PATCH failed:",ph)}},Ro):null;if(j)Q.addFlusher(j.flush),j.call([]);else console.log("[ticker] no cooking comment; plan mirroring disabled (direct mode)");if(Q.on("TodoWrite",(y)=>{let W=y.data?.todos;if(!Array.isArray(W))return;if(zo(W),fh=W,j)j.call(W)}),Ko(O,D,T,()=>{if(j)j.call(fh)}),b)Q.onMessage((y)=>{if(gh(y)){console.log(y.type==="compaction_started"?"[agent] context compaction started (summarising older turns)\u2026":"[agent] context compaction completed");return}let W=y;if(W.role==="user"&&W.hidden===!0&&W.kind==="system_reminder")console.log("[agent] system reminder injected")});await Q.observe(Xh(oh)),await Q.flush();let K=await Do(R),B=Date.now()-xh;if(console.log(""),console.log("=========================================="),console.log(`Agent exited with code ${K}`),console.log(`Duration: ${vh(B)}`),console.log("=========================================="),p){if(H("run-duration-ms",String(B)),await Xo(X),V.stdout)Ih(40,o.redact);return console.error("[runner] cancelled mid-run; the salvage step will recover any work and report the timeout"),130}if(H("exit-code",String(K)),H("run-duration-ms",String(B)),K===C||K===lh){let y=K===C?"turn limit":"time budget";return H("result",`Agent stopped early (reached the ${y})`),console.error(`[runner] agent reached the ${y}; the salvage step will recover any unpushed work and the report renders a stopped-early status`),0}return H("result",K===0?"Agent completed successfully":`Agent failed with exit code ${K}`),K}function Ko(h,n,o,f){if(q("INFER_BIN"))return;Jh(n,o).then((w)=>{if(!w)return;console.log(`[runner] gateway version: ${w}`),h.gatewayVersion=w,Zh(w),f()}).catch((w)=>console.error("[runner] gateway version probe failed:",w))}function Jo(h,n){return{...h,INFER_PROMPTS_AGENT_SYSTEM_PROMPT:n.systemPrompt,INFER_AGENT_SYSTEM_PROMPT_WITH_DEFAULTS:"true",INFER_TOOLS_BASH_ALLOW_APPEND:n.bashAllowAppend,INFER_REMINDERS_CONFIG:n.remindersYaml,INFER_REVIEW_INLINE:h.INFER_REVIEW_INLINE??"",INFER_COMPUTER_USE_RECORDING_ENABLED:String(n.recordDemo),...n.reviewMode?{INFER_TOOLS_EDIT_ENABLED:"false",INFER_TOOLS_WRITE_ENABLED:"false",INFER_TOOLS_DELETE_ENABLED:"false"}:{},OTEL_EXPORTER_OTLP_ENDPOINT:h.OTEL_EXPORTER_OTLP_ENDPOINT??"",OTEL_EXPORTER_OTLP_HEADERS:h.OTEL_EXPORTER_OTLP_HEADERS??"",OTEL_SERVICE_NAME:h.OTEL_SERVICE_NAME??"infer-action",OTEL_RESOURCE_ATTRIBUTES:h.OTEL_RESOURCE_ATTRIBUTES??""}}function Zo(h,n){try{let o=Wo(h,["debug","agent","system_prompt"],{env:n,encoding:"utf8",timeout:30000});if(o.status!==0||!o.stdout?.trim())return;return o.stdout}catch{return}}function jo(h,n){if(n)return h;let o=h.indexOf("PERSISTENT MEMORY INDEX");if(o===-1)return h;let f=h.slice(o),w=f.indexOf(`

Current date:`),u=w===-1?"":f.slice(w);return`${h.slice(0,o)}PERSISTENT MEMORY INDEX: [redacted - set debug: true to include memory entries]${u}`}function so(h,n){let o=`${qh}

${sh(n)}`;if(h.length===0)return`${o}

### Todos

_(agent has not posted a plan yet)_`;let f=h.map((w)=>{return`- ${w.status==="completed"?"[x]":w.status==="in_progress"?"[~]":"[ ]"} ${w.content}`});return[o,"","### Todos","",...f].join(`
`)}function Ho(h){let n=h.stderr;return((typeof n==="string"?n:"")+String(h.message)).includes("couldn't find remote ref")}function Qo(h,n=r){try{if(h.isFork){let o=`pr-${h.prNumber}`;console.log(`[runner] fork PR; fetching pull/${h.prNumber}/head into ${o}`),n(`git fetch origin pull/${h.prNumber}/head:${o}`),n(`git checkout ${o}`)}else{console.log(`[runner] checking out PR head branch ${h.headRef}`);try{n(`git fetch origin ${h.headRef}`)}catch(o){if(!Ho(o))throw o;process.stdout.write(`::warning::PR head branch ${h.headRef} no longer exists on origin (likely deleted when the PR was closed or merged); recreating it from pull/${h.prNumber}/head. If the PR is closed or merged, pushing will not reopen it.
`),n(`git fetch origin pull/${h.prNumber}/head:${h.headRef}`)}n(`git checkout ${h.headRef}`)}}catch(o){throw Error(`Failed to check out PR head (${h.headRef}). Aborting before spawning the agent so it doesn't run against the wrong branch.`,{cause:o})}}async function Do(h){if(h.exitCode!==null)return h.exitCode;return new Promise((n)=>{h.on("close",(o)=>n(o??0))})}async function Xo(h){if(h.writableFinished)return;await Promise.race([new Promise((n)=>h.once("finish",n)),new Promise((n)=>setTimeout(n,2000).unref())])}function zo(h){try{bh(S,JSON.stringify(h))}catch(n){console.error("[runner] failed to persist todos:",n)}}function Po(){try{bh(S,"[]")}catch{}}if(import.meta.main)Oo().then((h)=>process.exit(h),(h)=>{console.error("[runner] uncaught error:",h),process.exit(1)});export{Zo as resolveMergedSystemPrompt,so as renderPlan,jo as redactMemoryIndex,Qo as ensurePrHeadCheckedOut,Jo as buildChildEnv};
