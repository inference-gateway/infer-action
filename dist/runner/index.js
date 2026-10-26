#!/usr/bin/env bun
// @bun
import{spawn as qf,spawnSync as Wf}from"child_process";import{createWriteStream as Yf,writeFileSync as bn}from"fs";import{PassThrough as $f}from"stream";var hh=["git add( .*)?","git commit( .*)?","git push( .*)?","git checkout( .*)?","git switch( .*)?","git fetch( .*)?","git restore( .*)?","git reset( .*)?","git stash( .*)?","gh pr create( .*)?","gh pr ready( .*)?","gh pr edit( [0-9]+)? --(title|body|body-file)( .*)?",String.raw`gh api graphql -f query='query ?[({][^']*'( --jq '[^']*')?`,String.raw`gh api graphql -f query='mutation\(\$id:ID!\)\{resolveReviewThread\(input:\{threadId:\$id\}\)\{thread\{isResolved\}\}\}' -f id=PRRT_[A-Za-z0-9_-]+`],fh=["tmux (send-keys|capture-pane)( .*)?","ffmpeg( .*)?"];function on(n,h,f=!1){return[...n?hh:[],...f?fh:[],h.trim()].filter(Boolean).join(",")}import{spawnSync as Kn}from"child_process";import{readFileSync as If,writeFileSync as Zh}from"fs";import{homedir as Hh}from"os";import{join as Qh}from"path";async function wn(n,h){let f=n.INFER_CONTEXT_KIND;if(!f)throw Error("Missing required env var INFER_CONTEXT_KIND");if(f==="issue")return wh(n,h);if(f==="pull_request")return ih(n,h);if(f==="direct")return oh(n);throw Error(`Unknown INFER_CONTEXT_KIND "${f}" (expected "issue", "pull_request", or "direct")`)}function un(n){let h=n.INFER_CONTEXT_KIND;if(h==="direct")return{kind:"direct",prompt:(n.INFER_DIRECT_PROMPT??"").trim()||"(dry-run: no prompt)"};if(h==="pull_request"){let f=an(n),o=f?l(n):void 0;return{kind:"pull_request",prNumber:Number.parseInt(n.INFER_ISSUE_NUMBER??"0",10)||0,prTitle:"(dry-run: PR title unavailable)",prBody:"",headRef:"(unknown)",baseRef:"main",headRepoFullName:"",isFork:!1,prState:"open",triggeringCommentId:o?.id??0,comments:o?[{id:o.id,author:o.author,body:o.body,createdAt:"",isTrigger:!0}]:[],...f?{reviewComment:f}:{}}}return{kind:"issue",issueNumber:Number.parseInt(n.INFER_ISSUE_NUMBER??"0",10)||0,issueTitle:n.INFER_ISSUE_TITLE??"",issueBody:n.INFER_ISSUE_BODY??""}}function oh(n){let h=(n.INFER_DIRECT_PROMPT??"").trim();if(!h)throw Error("Missing or empty INFER_DIRECT_PROMPT for direct context");return{kind:"direct",prompt:h}}async function wh(n,h){let f=Number.parseInt(n.INFER_ISSUE_NUMBER??"",10);if(!Number.isFinite(f))throw Error("Missing or invalid INFER_ISSUE_NUMBER");let o=n.INFER_ISSUE_TITLE??"",w=n.INFER_ISSUE_BODY??"",u=l(n),[{associatedPrs:a,associatedBranches:i},k]=await Promise.all([ah(h,f),uh(h,f,u?.id??0)]);return{kind:"issue",issueNumber:f,issueTitle:o,issueBody:w,...u?{triggeringComment:u}:{},...a.length?{associatedPrs:a}:{},...i.length?{associatedBranches:i}:{},...k.length?{threadComments:k}:{}}}async function uh(n,h,f){try{return(await n.listIssueComments(h)).map((w)=>({id:w.id,author:w.author,body:w.body,createdAt:w.createdAt,isTrigger:f>0&&w.id===f}))}catch(o){return console.warn(`[context] failed to list comments for issue #${h}; proceeding without the thread:`,o instanceof Error?o.message:o),[]}}async function ah(n,h){let f=`fix/issue-${h}`;try{let[o,w]=await Promise.all([n.getOpenPrForBranch(f),n.findPrsReferencingIssue(h)]),u=new Map;for(let k of w)u.set(k.number,k);if(o){let k=u.get(o.number);u.set(o.number,{number:o.number,url:k?.url||o.url,state:k?.state||"open",headRef:f,baseRef:o.baseRef,isDraft:k?.isDraft??!1,title:k?.title??""})}return{associatedPrs:[...u.values()],associatedBranches:o?[f]:[]}}catch(o){return console.warn(`[context] failed to gather existing work for issue #${h}; proceeding without it:`,o instanceof Error?o.message:o),{associatedPrs:[],associatedBranches:[]}}}async function ih(n,h){let f=Number.parseInt(n.INFER_ISSUE_NUMBER??"",10);if(!Number.isFinite(f))throw Error("Missing or invalid INFER_ISSUE_NUMBER for PR context");let o=Number.parseInt(n.INFER_TRIGGERING_COMMENT_ID??"",10),w=Number.isFinite(o)?o:0,u=an(n),[a,i]=await Promise.all([h.getPullRequest(f),u?kh(n,h,f,w):h.listIssueComments(f).then((O)=>O.map((J)=>({id:J.id,author:J.author,body:J.body,createdAt:J.createdAt,isTrigger:w>0&&J.id===w})))]),k=`${h.owner}/${h.repoName}`,Y=a.headRepoFullName!==""&&a.headRepoFullName!==k;return{kind:"pull_request",prNumber:f,prTitle:a.title,prBody:a.body,headRef:a.headRef,baseRef:a.baseRef,headRepoFullName:a.headRepoFullName,isFork:Y,prState:a.state,triggeringCommentId:w,comments:yh(i,n),...u?{reviewComment:u}:{}}}function an(n){let h=(n.INFER_REVIEW_COMMENT_PATH??"").trim();if(!h)return;let f=Number.parseInt(n.INFER_REVIEW_COMMENT_LINE??"",10),o=Number.parseInt(n.INFER_REVIEW_COMMENT_START_LINE??"",10);return{path:h,diffHunk:n.INFER_REVIEW_COMMENT_DIFF_HUNK??"",...Number.isFinite(f)?{line:f}:{},...Number.isFinite(o)?{startLine:o}:{}}}async function kh(n,h,f,o){let w=Number.parseInt(n.INFER_REVIEW_COMMENT_IN_REPLY_TO??"",10),u=[];if(Number.isFinite(w)&&w>0){let a=await h.listReviewComments(f);for(let i of a)if(i.id===w||i.inReplyToId===w)u.push({id:i.id,author:i.author,body:i.body,createdAt:i.createdAt,isTrigger:o>0&&i.id===o})}return u}function yh(n,h){if(n.some((o)=>o.isTrigger))return n;let f=l(h);return f?[...n,{...f,createdAt:"",isTrigger:!0}]:n}function l(n){let h=n.INFER_TRIGGERING_COMMENT_ID??"",f=n.INFER_TRIGGERING_COMMENT_BODY??"",o=n.INFER_TRIGGERING_COMMENT_AUTHOR??"",w=Number.parseInt(h,10);if(!Number.isFinite(w)||w<=0)return;if(!f.trim())return;return{id:w,body:f,author:o}}class M{token;baseUrl;fetchImpl;constructor(n){this.token=n.token,this.baseUrl=(n.baseUrl||process.env.GITHUB_API_URL||"https://api.github.com").replace(/\/+$/,""),this.fetchImpl=n.fetchImpl??fetch}issues={getComment:(n)=>this.request("GET",`/repos/${n.owner}/${n.repo}/issues/comments/${n.comment_id}`),updateComment:(n)=>this.request("PATCH",`/repos/${n.owner}/${n.repo}/issues/comments/${n.comment_id}`,void 0,{body:n.body}),createComment:(n)=>this.request("POST",`/repos/${n.owner}/${n.repo}/issues/${n.issue_number}/comments`,void 0,{body:n.body}),listComments:(n)=>this.request("GET",`/repos/${n.owner}/${n.repo}/issues/${n.issue_number}/comments`,{per_page:n.per_page,page:n.page}),listEventsForTimeline:(n)=>this.request("GET",`/repos/${n.owner}/${n.repo}/issues/${n.issue_number}/timeline`,{per_page:n.per_page})};pulls={list:(n)=>this.request("GET",`/repos/${n.owner}/${n.repo}/pulls`,{head:n.head,state:n.state,per_page:n.per_page}),get:(n)=>this.request("GET",`/repos/${n.owner}/${n.repo}/pulls/${n.pull_number}`),create:(n)=>this.request("POST",`/repos/${n.owner}/${n.repo}/pulls`,void 0,{head:n.head,base:n.base,title:n.title,body:n.body,draft:n.draft}),listComments:(n)=>this.request("GET",`/repos/${n.owner}/${n.repo}/pulls/${n.pull_number}/comments`,{per_page:n.per_page,page:n.page}),update:(n)=>this.request("PATCH",`/repos/${n.owner}/${n.repo}/pulls/${n.pull_number}`,void 0,{body:n.body}),getComment:(n)=>this.request("GET",`/repos/${n.owner}/${n.repo}/pulls/comments/${n.comment_id}`),updateComment:(n)=>this.request("PATCH",`/repos/${n.owner}/${n.repo}/pulls/comments/${n.comment_id}`,void 0,{body:n.body}),createReview:(n)=>this.request("POST",`/repos/${n.owner}/${n.repo}/pulls/${n.pull_number}/reviews`,void 0,{event:n.event,body:n.body,comments:n.comments})};checks={listForRef:(n)=>this.request("GET",`/repos/${n.owner}/${n.repo}/commits/${n.ref}/check-runs`,{per_page:n.per_page??100})};repos={get:(n)=>this.request("GET",`/repos/${n.owner}/${n.repo}`),createOrUpdateFileContents:(n)=>this.request("PUT",`/repos/${n.owner}/${n.repo}/contents/${n.path}`,void 0,{message:n.message,content:n.content,branch:n.branch})};git={getRef:(n)=>this.request("GET",`/repos/${n.owner}/${n.repo}/git/ref/${n.ref}`),createRef:(n)=>this.request("POST",`/repos/${n.owner}/${n.repo}/git/refs`,void 0,{ref:n.ref,sha:n.sha}),createCommit:(n)=>this.request("POST",`/repos/${n.owner}/${n.repo}/git/commits`,void 0,{message:n.message,tree:n.tree})};async request(n,h,f,o){let w=`${this.baseUrl}${h}`;if(f){let i=new URLSearchParams;for(let[k,Y]of Object.entries(f))i.set(k,String(Y));w+=`?${i.toString()}`}let u={Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","User-Agent":"infer-action"};if(this.token)u.Authorization=`Bearer ${this.token}`;if(o!==void 0)u["Content-Type"]="application/json";let a=await this.fetchImpl(w,{method:n,headers:u,...o!==void 0?{body:JSON.stringify(o)}:{}});if(!a.ok){let i=await a.text().catch(()=>"");throw Error(`GitHub API ${n} ${h} -> ${a.status} ${a.statusText}: ${i.slice(0,300)}`)}if(a.status===204)return{data:void 0};return{data:await a.json()}}}var qh=20;function kn(n){return n.replace(/`/g,"")}var z="<!-- infer:plan-end -->",P="<!-- infer:result-start -->",H="infer-artifacts",Wh="4b825dc642cb6eb9a060e54bf8d69288fbee4904",yn="<!-- infer:spinner -->",N="<!-- /infer:spinner -->",qn=`${yn}<img src="https://raw.githubusercontent.com/inference-gateway/infer-action/main/assets/spinner.svg" width="22" height="22" alt="Working" />${N}`;function Yh(n){let h=n.indexOf(yn);if(h===-1)return n;let f=n.indexOf(N,h);if(f===-1)return n;let o=f+N.length;while(o<n.length&&(n[o]===`
`||n[o]==="\r"))o++;return n.slice(0,h)+n.slice(o)}function $h(n){let h=n.indexOf(z),f=n.indexOf(P);if(h===-1&&f===-1)return{plan:n,middle:"",result:""};if(h===-1)return{plan:n.slice(0,f),middle:"",result:n.slice(f+P.length)};if(f===-1)return{plan:n.slice(0,h),middle:n.slice(h+z.length),result:""};return{plan:n.slice(0,h),middle:n.slice(h+z.length,f),result:n.slice(f+P.length)}}function Rh(n){let h=n.plan.trim(),f=n.middle.trim(),o=n.result.trim();if(!f&&!o)return h;let w=h;if(w+=`

${z}`,f)w+=`

${f}`;if(w+=`

${P}`,o)w+=`

${o}`;return w}class E{api;redactor;dryRun;reviewComment;artifactsBranchEnsured=!1;owner;repoName;constructor(n){this.api=n.api??new M({token:n.token}),this.redactor=n.redactor,this.dryRun=n.dryRun??!1,this.reviewComment=n.reviewComment??!1;let[h,f]=n.repo.split("/");if(!h||!f)throw Error(`Invalid repo string "${n.repo}", expected "owner/name"`);this.owner=h,this.repoName=f}commentUrl(n){return`https://github.com/${this.owner}/${this.repoName}/issues/comments/${n}`}issueUrl(n){return`https://github.com/${this.owner}/${this.repoName}/issues/${n}`}prUrl(n){return`https://github.com/${this.owner}/${this.repoName}/pull/${n}`}async getCommentBody(n){return(await(this.reviewComment?this.api.pulls:this.api.issues).getComment({owner:this.owner,repo:this.repoName,comment_id:n})).data.body??""}async updateCommentBody(n,h){let f=this.redactor?this.redactor.redact(h):h;if(this.dryRun){console.log(`[dry-run] would update comment #${n} (${this.commentUrl(n)}):
${f}`);return}await(this.reviewComment?this.api.pulls:this.api.issues).updateComment({owner:this.owner,repo:this.repoName,comment_id:n,body:f})}async createIssueComment(n,h){let f=this.redactor?this.redactor.redact(h):h;if(this.dryRun){console.log(`[dry-run] would create a github issue comment on issue #${n} (${this.issueUrl(n)}):
${f}`);return}await this.api.issues.createComment({owner:this.owner,repo:this.repoName,issue_number:n,body:f})}async updateZone(n,h,f){if(this.dryRun){let u=this.redactor?this.redactor.redact(f):f;console.log(`[dry-run] would update the ${h} zone of comment #${n} (${this.commentUrl(n)}):
${u}`);return}let o=await this.getCommentBody(n),w=$h(o);w[h]=f,await this.updateCommentBody(n,Rh(w))}async clearSpinner(n){if(this.dryRun){console.log(`[dry-run] would clear the spinner on comment #${n} (${this.commentUrl(n)})`);return}let h=await this.getCommentBody(n),f=Yh(h);if(f===h)return;await this.updateCommentBody(n,f)}async getOpenPrForBranch(n){let f=(await this.api.pulls.list({owner:this.owner,repo:this.repoName,head:`${this.owner}:${n}`,state:"open",per_page:1})).data[0];if(!f)return null;return{number:f.number,url:f.html_url,body:f.body??"",baseRef:f.base.ref}}async getPrForBranch(n){let h=await this.api.pulls.list({owner:this.owner,repo:this.repoName,head:`${this.owner}:${n}`,state:"all",per_page:20}),f=(a)=>({number:a.number,url:a.html_url,body:a.body??"",baseRef:a.base.ref,state:a.state==="open"?"open":"closed",merged:a.merged_at!=null}),o=h.data.find((a)=>a.state==="open");if(o)return f(o);let w=h.data.find((a)=>a.merged_at!=null);if(w)return f(w);let u=h.data[0];return u?f(u):null}async findPrsReferencingIssue(n){let f=(await this.api.issues.listEventsForTimeline({owner:this.owner,repo:this.repoName,issue_number:n,per_page:100})).data,o=new Map;for(let w of f){if(w.event!=="cross-referenced")continue;let u=w.source?.issue;if(!u||!u.pull_request||typeof u.number!=="number")continue;o.set(u.number,{number:u.number,url:u.html_url??"",state:u.state??"",headRef:"",baseRef:"",isDraft:u.draft??!1,title:u.title??""})}return[...o.values()]}async updatePullRequestBody(n,h){let f=this.redactor?this.redactor.redact(h):h;if(this.dryRun){console.log(`[dry-run] would update PR #${n} body (${this.prUrl(n)}):
${f}`);return}await this.api.pulls.update({owner:this.owner,repo:this.repoName,pull_number:n,body:f})}async createDraftPr(n){let h=this.redactor?this.redactor.redact(n.body):n.body;if(this.dryRun)return console.log(`[dry-run] would open a DRAFT PR ${n.head} -> ${n.base} titled "${n.title}":
${h}`),{number:0,url:"(dry-run)",body:h,baseRef:n.base};let f=await this.api.pulls.create({owner:this.owner,repo:this.repoName,head:n.head,base:n.base,title:n.title,body:h,draft:!0});return{number:f.data.number,url:f.data.html_url,body:f.data.body??"",baseRef:f.data.base.ref}}async uploadArtifactImage(n,h,f){let o=`${n}/${encodeURIComponent(h)}`,w=`https://raw.githubusercontent.com/${this.owner}/${this.repoName}/${H}/${n}/${encodeURIComponent(h)}`;if(this.dryRun)return console.log(`[dry-run] would upload artifact image ${h} to branch ${H} at ${o}`),w;try{return await this.ensureArtifactsBranch(),(await this.api.repos.createOrUpdateFileContents({owner:this.owner,repo:this.repoName,path:o,message:`chore: add run artifact ${h} (run ${n})`,content:Buffer.from(f).toString("base64"),branch:H})).data.content?.download_url||w}catch(u){return console.error(`artifact image upload failed for ${h}:`,u),null}}async ensureArtifactsBranch(){if(this.artifactsBranchEnsured)return;try{await this.api.git.getRef({owner:this.owner,repo:this.repoName,ref:`heads/${H}`}),this.artifactsBranchEnsured=!0;return}catch{}let n=await this.api.git.createCommit({owner:this.owner,repo:this.repoName,message:`chore: initialize ${H} branch for run artifacts`,tree:Wh});await this.api.git.createRef({owner:this.owner,repo:this.repoName,ref:`refs/heads/${H}`,sha:n.data.sha}),this.artifactsBranchEnsured=!0}async createReview(n){if(this.dryRun){console.log(`[dry-run] would submit a ${n.event} review on #${n.pullNumber} with ${n.comments.length} inline comment(s)`);return}await this.api.pulls.createReview({owner:this.owner,repo:this.repoName,pull_number:n.pullNumber,event:n.event,body:n.body,comments:n.comments})}async getDefaultBranch(){return(await this.api.repos.get({owner:this.owner,repo:this.repoName})).data.default_branch}async getPullRequest(n){let h=await this.api.pulls.get({owner:this.owner,repo:this.repoName,pull_number:n});return{title:h.data.title,body:h.data.body??"",headRef:h.data.head.ref,headRepoFullName:h.data.head.repo?.full_name??"",baseRef:h.data.base.ref,state:h.data.merged_at?"merged":h.data.state==="open"?"open":"closed"}}async listIssueComments(n){let h=[],f=2;for(let o=1;o<=2;o++){let w=await this.api.issues.listComments({owner:this.owner,repo:this.repoName,issue_number:n,per_page:100,page:o});for(let u of w.data)h.push({id:u.id,author:u.user?.login??"unknown",body:u.body??"",createdAt:u.created_at});if(w.data.length<100)break}return h}async listReviewComments(n){let h=[],f=2;for(let o=1;o<=2;o++){let w=await this.api.pulls.listComments({owner:this.owner,repo:this.repoName,pull_number:n,per_page:100,page:o});for(let u of w.data)h.push({id:u.id,author:u.user?.login??"unknown",body:u.body??"",createdAt:u.created_at,inReplyToId:u.in_reply_to_id??0});if(w.data.length<100)break}return h}async getPrCheckRuns(n){try{let f=(await this.api.checks.listForRef({owner:this.owner,repo:this.repoName,ref:n})).data.check_runs;if(f.length===0)return"";let o=f.filter((a)=>a.conclusion==="failure"||a.conclusion==="timed_out"||a.conclusion==="action_required"),w=f.filter((a)=>a.status!=="completed"),u=[];for(let a of o){u.push(`- **${kn(a.name)}**: ${a.conclusion}`);let i=a.output?.summary?.trim()||a.output?.text?.trim()||"";if(i){let k=i.split(`
`).slice(0,qh).join(`
`).slice(0,2000);u.push("  ```"),u.push(k),u.push("  ```")}}if(w.length>0)u.push(`- **${w.length} pending check(s)**: ${w.map((a)=>kn(a.name)).join(", ")}`);if(u.length===0)return"";return`## CI Checks

${u.join(`
`)}`}catch(h){return console.warn(`[github] failed to fetch check runs for ref ${n}:`,h instanceof Error?h.message:h),""}}}var A=["GITHUB_TOKEN","OLLAMA_CLOUD_API_KEY","GROQ_API_KEY","LLAMACPP_API_KEY","OPENAI_API_KEY","CLOUDFLARE_API_KEY","COHERE_API_KEY","ANTHROPIC_API_KEY","DEEPSEEK_API_KEY","GOOGLE_API_KEY","MISTRAL_API_KEY","MINIMAX_API_KEY","MOONSHOT_API_KEY","NVIDIA_API_KEY","ZAI_API_KEY","OTEL_EXPORTER_OTLP_HEADERS","MEMORY_TOKEN","MEMORY_DEPLOY_KEY"],Oh=["-----BEGIN [A-Z ]*PRIVATE KEY( BLOCK)?-----[\\s\\S]+?-----END [A-Z ]*PRIVATE KEY( BLOCK)?-----"],Kh=["github_pat_[A-Za-z0-9_]{82,}","gh[pours]_[A-Za-z0-9]{36,}","AIza[0-9A-Za-z_-]{35}","xox[bpoa]-[A-Za-z0-9-]{20,}","sk-[A-Za-z0-9_-]{20,}","eyJ[A-Za-z0-9_-]+\\.eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]{10,}"];var sh=/[.*+?^${}()|[\]\\]/g;function I(n,h,f=8){let o=[],w=new Set;for(let u of h){let a=n[u];if(typeof a!=="string")continue;if(a.trim().length<f)continue;if(w.has(a))continue;w.add(a),o.push(a)}return o}function Wn(n){let h=new Set;for(let f of n){if(!f||h.has(f))continue;h.add(f),process.stdout.write(`::add-mask::${f}
`)}}function Yn(n={}){let h=n.placeholder??"***",f=n.minLength??8,o=n.env??process.env,w=n.heuristics??!1,u=I(o,A,f);u.sort((k,Y)=>Y.length-k.length);let a=u.map(Jh);if(a.push(...Oh),w)a.push(...Kh);let i=a.length>0?new RegExp(a.join("|"),"g"):null;return{secretCount:u.length,redact(k){if(!i||!k)return k;return k.replace(i,h)}}}function Jh(n){return n.replace(sh,"\\$&")}var F="/tmp/agent-output.txt",_="/tmp/infer-todos.json",S="/tmp/infer-cancelled",$n="/tmp/infer-gateway-version";function G(n){let h=process.env[n];if(!h)throw Error(`Missing required env var ${n}`);return h}function q(n){return process.env[n]??""}function Rn(){let n=q("INFER_DRY_RUN")==="true",h=n?q("GITHUB_TOKEN"):G("GITHUB_TOKEN"),f=G("INFER_REPO"),o=q("INFER_ENABLE_GIT_OPERATIONS")!=="false",w=q("INFER_REDACT_HEURISTICS")==="true",u=I(process.env,A);Wn(u);let a=Yn({env:process.env,heuristics:w}),i=q("INFER_COOKING_COMMENT_IS_REVIEW")==="true",k=new E({token:h,repo:f,redactor:a,dryRun:n,reviewComment:i});return{dryRun:n,token:h,repo:f,enableGitOps:o,enableHeuristics:w,redactor:a,github:k}}async function On(n,h,f){try{return await wn(n,h)}catch(o){if(f.failHard)throw o;return console.warn(`[${f.stepName}] context read failed (${o.message}); proceeding with env-derived data`),un(n)}}var jh=3000,Dh=300000,Xh=2000;async function sn(n,h,f={}){let o=f.readConfig?f.readConfig():Fh(n,h);if(!o)return"";let w=await zh(o.url,f.fetcher??fetch,f.intervalMs,f.deadlineMs);if(w)return w;if(!o.run)return"";if(o.oci&&!o.standaloneBinary)return Gh(o.oci);return f.binaryVersion?f.binaryVersion():Lh()}function Jn(n){return n?`v${n}`:""}async function zh(n,h=fetch,f=jh,o=Dh){let w=`${n.replace(/\/+$/,"")}/version`,u=Date.now()+o;for(;;){try{let a=await h(w,{signal:AbortSignal.timeout(Xh)});if(a.ok){let i=Ph(await a.text());if(i)return i}}catch{}if(Date.now()+f>=u)return"";await new Promise((a)=>setTimeout(a,f).unref())}}function Ph(n){try{let h=JSON.parse(n);if(h&&typeof h==="object"&&typeof h.version==="string")return U(h.version)}catch{}return U(n)}function U(n){let h=n.trim().replace(/^v/,""),f=h[0]??"";if(h===""||h.length>32||f<"0"||f>"9")return"";return/^[0-9A-Za-z.+-]+$/.test(h)?h:""}function Gh(n){let h=n.slice(n.lastIndexOf("/")+1),f=h.indexOf(":");if(f>=0)h=h.slice(f+1);return U(h)}function Fh(n,h){try{let f=Kn(n,["config","get","gateway","--format","json"],{env:h,encoding:"utf8",timeout:15000,stdio:["ignore","pipe","pipe"]});if(f.status!==0)return null;return Uh(f.stdout??"")}catch{return null}}function Uh(n){let h=JSON.parse(n),f=typeof h.url==="string"?h.url:"";if(!f)return null;return{url:f,run:h.run!==!1,oci:typeof h.oci==="string"?h.oci:"",standaloneBinary:h.standalone_binary===!0}}function Vh(n=Hh()){let h=process.platform==="win32"?"inference-gateway.exe":"inference-gateway";return Qh(n,".infer","bin",h)}function Lh(n=Kn,h=Vh()){try{let f=n(h,["--version"],{encoding:"utf8",timeout:5000,stdio:["ignore","pipe","pipe"]}),o=(f.stdout??"").trim().split(/\s+/).filter(Boolean);if(f.status!==0)return"";return U(o[o.length-1]??"")}catch{return""}}function Zn(n){try{Zh($n,n)}catch(h){console.error("[gateway] failed to persist gateway version:",h)}}function Hn(n,h){return{model:h,actionVersion:n.INFER_ACTION_VERSION??"",cliVersion:n.INFER_CLI_VERSION??"",gatewayVersion:"",workflowUrl:n.INFER_WORKFLOW_URL??""}}function Qn(n){return[`**Model:** \`${n.model}\``,n.actionVersion?`**Action:** ${Bh(n.actionVersion)}`:"",n.cliVersion?`**CLI:** \`${n.cliVersion}\``:"",n.gatewayVersion?`**Gateway:** \`${n.gatewayVersion}\``:"",n.workflowUrl?`[View Job](${n.workflowUrl})`:""].filter(Boolean).join(" \xB7 ")}function Bh(n){let h=/^[0-9a-f]{40}$/.test(n)?`https://github.com/inference-gateway/infer-action/commit/${n}`:`https://github.com/inference-gateway/infer-action/releases/tag/${n}`;return`[\`${n}\`](${h})`}var jn=(n)=>/^(true|1)$/i.test((n??"").trim());function Dn(n){let h=(n.INFER_MIRROR_AGENT_LOGS??"").trim();return{stdout:h!==""?jn(h):jn(n.INFER_LOGGING_DEBUG),stderr:!0}}import Th from"readline";async function*zn(n){let h=Th.createInterface({input:n,crlfDelay:1/0}),f=null;for await(let o of h){if(f){if(f.push(o),o==="}"){let a=Xn(f.join(`
`));if(f=null,a)yield a}continue}let w=o.trim();if(!w)continue;if(w==="{"){f=[w];continue}if(w[0]!=="{")continue;let u=Xn(w);if(u)yield u}}function Xn(n){try{let h=JSON.parse(n);if(typeof h!=="object"||h===null)return null;let{role:f,type:o}=h;if(typeof f==="string"||o==="session_stats"||o==="compaction_started"||o==="compaction_completed")return h;return null}catch{return null}}var Pn={SYSTEM_DIRECT:`# Infer Agent (manual run)

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

Run \`git diff origin/{{baseRef}}...HEAD\` for the full diff and \`git log origin/{{baseRef}}..HEAD\` for the commit history.{{triggerSection}}`};function lh(n){let h=process.env[`INFER_PROMPT_OVERRIDE_${n}`];return h&&h.trim()?h:Pn[n]}function Mh(n){let h=process.env[`INFER_PROMPT_OVERRIDE_${n}`];return h&&h.trim()?h:null}var Nh={SYSTEM_ISSUE:["git commit","git push","gh pr create","gh pr ready","git status"],SYSTEM_DIRECT:["git commit","git push","gh pr create","gh pr ready","git status"],SYSTEM_PR:["git commit","git push","git status"],SYSTEM_PR_FORK:["git commit","git push"]};function Eh(n){if(n.kind==="issue")return"SYSTEM_ISSUE";if(n.kind==="direct")return"SYSTEM_DIRECT";if(n.isFork)return"SYSTEM_PR_FORK";return"SYSTEM_PR"}function Gn(n){let h=Eh(n),f=Mh(h);if(f===null)return[];let o=Nh[h];if(!o||o.length===0)return[];let w=o.filter((u)=>!f.includes(u));return w.length>0?[{key:h,missing:w}]:[]}function s(n,h={}){return lh(n).replace(/\{\{(\w+)\}\}/g,(f,o)=>{if(!(o in h))throw Error(`Missing variable "${o}" for prompt "${n}"`);return String(h[o])})}function Fn(n,h={}){if(n.kind==="issue")return vh(n);if(n.kind==="direct")return gh(n);return Ch(n,h.diffStat??"",h.ciChecksSection??"")}var Ah=`## A2A Agents

Delegated A2A tasks run in the background and you are notified automatically when they complete. Submit each task exactly once with A2A_SubmitTask, then WAIT for the completion notification - never resubmit the same task or poll for it in a loop. Only retry a submission if the submission call itself failed (e.g. the agent container was still starting).`,Ih='## Images in the conversation\n\nIssue/PR text may embed images (`![...](url)` or `<img src="...">`) - screenshots, error dialogs, diagrams. These often carry the crux of the request, so read them BEFORE starting work: download each with WebFetch (`download=true`), then run ImageDecode on the saved file path, passing a `prompt` asking for what you need (e.g. the exact error text, the UI elements shown). If a download fails (private-repo attachments may be inaccessible), say so in your final response and continue with the text.',_h='## Inline review mode\n\nWhen review-inline is enabled, the runner submits your review as a real GitHub\npull request review with inline, line-anchored comments. ALWAYS end your final\nmessage with a fenced JSON block carrying your verdict and structured findings,\neven when there are no findings:\n\n````json:findings\n{\n  "verdict": "comment",\n  "findings": [\n    {\n      "path": "src/parser.ts",\n      "line": 42,\n      "side": "RIGHT",\n      "start_line": 40,\n      "body": "Off-by-one on the loop bound.\\n\\n```suggestion\\nfor (let i = 0; i < n; i++) {\\n```"\n    }\n  ]\n}\n````\n\nSet `"verdict": "approve"` only when the PR is ready to merge as-is and\n`findings` is empty; otherwise use `"comment"`. An approve verdict is\nsubmitted as an approval (or as a comment review on a PR you opened yourself).\n\nEach finding must reference a file and line that exists in the PR diff.\nUse `side: "RIGHT"` for new code, `"LEFT"` for the base. For multi-line\ncomments include `start_line` and `start_side`. The `body` can carry\n```suggestion blocks the PR author can apply with one click. The runner\nstrips this block from the summary comment, so your prose above it is still\nvisible there.';function Un(n,h){let f=Sh(n);if(process.env.INFER_A2A_ENABLED==="true")f=`${f}

${Ah}`;if(process.env.INFER_VISION_ANNOTATOR_ENABLED==="true")f=`${f}

${Ih}`;if(n.kind==="pull_request"&&process.env.INFER_REVIEW_MODE==="true"&&process.env.INFER_REVIEW_INLINE==="true")f=`${f}

${_h}`;if(h.trim())return`${f}

## Additional Instructions

${h}`;return f}function Sh(n){if(n.kind==="issue")return s("SYSTEM_ISSUE",{issueNumber:n.issueNumber});if(n.kind==="direct")return s("SYSTEM_DIRECT");if(n.isFork)return s("SYSTEM_PR_FORK",{prNumber:n.prNumber,headRef:n.headRef,headRepoFullName:n.headRepoFullName,baseRef:n.baseRef});return s("SYSTEM_PR",{prNumber:n.prNumber,headRef:n.headRef,baseRef:n.baseRef})}function gh(n){return s("TASK_DIRECT",{prompt:n.prompt})}function vh(n){let h=n.triggeringComment?`

## Triggering comment from @${n.triggeringComment.author}

${n.triggeringComment.body}

Treat this comment as the user's most recent intent. If it asks for something more specific than the issue body, prioritise it.`:"";return s("TASK_ISSUE",{issueNumber:n.issueNumber,issueTitle:n.issueTitle,issueBody:n.issueBody,existingWorkSection:rh(n),recentCommentsSection:Vn((n.threadComments??[]).filter((f)=>!f.isTrigger),"Recent comments (chronological)"),triggeringCommentSection:h})}function Vn(n,h){let f=n.filter((a)=>!a.author.endsWith("[bot]")),o=f.slice(-3);if(o.length===0)return"";let w=f.length-o.length,u=w>0?`_\u2026${w} earlier comment${w===1?"":"s"} omitted_

`:"";return`

## ${h}

${u}${o.map(Ln).join(`

`)}`}function rh(n){let h=n.associatedPrs??[],f=n.associatedBranches??[];if(h.length===0&&f.length===0)return"";let o=["## Existing work for this issue","A prior run or another contributor may already have started on this issue. Before creating a branch, inspect the items below and CONTINUE from them if they contain relevant work - check it out (`gh pr checkout <number>`, or `git fetch origin <branch> && git checkout <branch>`) and build on top of it rather than starting fresh. Only start a new branch if none of these apply."];if(h.length){let w=h.map((u)=>{let a=u.isDraft?" (draft)":"",i=u.state&&u.state!=="open"?` [${u.state}]`:"",k=u.headRef?` - branch \`${u.headRef}\``:"",Y=u.title?` - ${u.title}`:"";return`- PR #${u.number}${a}${i}${k}: ${u.url}${Y}`});o.push(`### Pull requests

`+w.join(`
`))}if(f.length)o.push(`### Branches

`+f.map((w)=>`- \`${w}\``).join(`
`));return`

`+o.join(`

`)}function Ch(n,h,f){let o=n.isFork?`
Head lives in a fork: ${n.headRepoFullName}. You CANNOT push commits to it from this runner.`:"";if(n.prState!=="open")o+=`
This PR is already ${n.prState}. Its head branch may have been deleted, and the checkout is likely on the default branch. Treat the request as follow-up work: if it needs no code changes (e.g. filing a follow-up issue), just do that; if it needs code changes, create a NEW branch off ${n.baseRef} and open a new PR - never push to the old head branch.`;let w=n.comments.find((O)=>O.isTrigger),u=w?`

## Triggering comment from @${w.author} (id: ${w.id})

${w.body}

This is the user's most recent ask. Address it directly. Do not re-implement existing changes unless this comment asks for that.`:"",a=n.comments.filter((O)=>!O.isTrigger);if(n.reviewComment)return eh(n,n.reviewComment,{forkNotice:o,triggerSection:u,others:a});let i=Vn(a,"Other comments (chronological)"),k=n.prBody.trim()?n.prBody:"_(no description)_",Y=h.trim()?"```\n"+h.trim()+"\n```":"_(no changes on this branch yet)_";return s("TASK_PR",{prNumber:n.prNumber,prTitle:n.prTitle,headRef:n.headRef,baseRef:n.baseRef,forkNotice:o,prBody:k,triggerSection:u,otherCommentsSection:i,diffStatSection:Y,ciChecksSection:f})}function eh(n,h,f){let o=h.startLine&&h.line&&h.startLine!==h.line?`, lines ${h.startLine}-${h.line}`:h.line?`, line ${h.line}`:"",w=f.others.length>0?`

## Earlier comments in this review thread

${f.others.map(Ln).join(`

`)}`:"";return s("TASK_PR_REVIEW",{prNumber:n.prNumber,prTitle:n.prTitle,headRef:n.headRef,baseRef:n.baseRef,forkNotice:f.forkNotice,filePath:h.path,lineInfo:o,diffHunk:h.diffHunk,threadSection:w,triggerSection:f.triggerSection})}function Ln(n){return`**@${n.author}** \xB7 ${n.createdAt}

${n.body}`}function bh(n){if(!Number.isFinite(n)||n<=0)return 10;return Math.max(10,Math.round(n*0.1))}function dh(n){return Math.max(1,Math.floor(n*0.8))}function mh(n){if(n.kind==="direct")return n.prompt;if(n.kind==="issue")return n.triggeringComment?.body??`${n.issueTitle}
${n.issueBody}`;return n.comments.find((h)=>h.isTrigger)?.body??`${n.prTitle}
${n.prBody}`}function Tn(n){return/\bdemo(s|nstrat\w*)?\b/i.test(mh(n))}function th(n,h){let f=[],o=h.enableGitOps&&!(n.kind==="pull_request"&&n.isFork);if(f.push({name:"infer-action-context",hook:"pre_stream",trigger:"interval",interval:5,text:h.enableGitOps?ch(n):"<system-reminder>Keep your TodoWrite plan current as you go. Only answering a question? Ignore this.</system-reminder>"}),o){if(f.push({name:"infer-action-wrap-up",hook:"pre_stream",trigger:"turns_before_max",threshold:bh(h.maxTurns??0),text:Bn(n)}),h.maxDurationMinutes&&h.maxDurationMinutes>0)f.push({name:"infer-action-wrap-up-time",hook:"pre_stream",trigger:"elapsed_minutes",threshold:dh(h.maxDurationMinutes),text:Bn(n,"time budget")});f.push({name:"infer-action-failed-tool",hook:"post_tool",trigger:"on_failure",text:ph()})}if(h.recordDemo)f.push({name:"infer-action-record-demo",hook:"pre_stream",trigger:"once",text:xh()});return f}function ch(n){if(n.kind==="pull_request"&&n.isFork)return"<system-reminder>This PR is from a fork - you CANNOT commit or push. Investigate with file reads and git diff, then answer the user's question or summarise. Keep your TodoWrite plan current.</system-reminder>";if(n.kind==="pull_request")return`<system-reminder>Keep your TodoWrite plan current. If you changed files, commit + push after each step so PR #${n.prNumber} stays current - unpushed work is lost when the job ends. Only reviewing or answering? Do not change, commit, or push anything.</system-reminder>`;return"<system-reminder>Keep your TodoWrite plan current. Changing code? Work on a pushed branch with an open draft PR (`gh pr create --draft`) and commit + push after each step so nothing is lost - never commit on or push to main. Only answering a question? Ignore this.</system-reminder>"}function Bn(n,h="turn limit"){let f=n.kind==="pull_request"?`so PR #${n.prNumber} is up to date, and update the PR body with a checklist of the remaining todos`:"and make sure the draft PR exists: `gh pr create --draft` with a title like `wip: <short description of the task>` and a body listing the remaining todos and unfinished work, so a human can pick up where you left off";return`<system-reminder>You are close to the ${h}. Stop starting new work - if you have uncommitted or unpushed changes, commit and push them now ${f}. If the repo's checks fail on commit and you cannot fix them before the ${h}, commit with --no-verify as a last resort rather than losing the work. Unpushed work is lost when the run ends. If you changed nothing, just finish your summary.</system-reminder>`}function xh(){return'<system-reminder>The user asked for a demo: load the `demo` skill now and follow it.\nAdd "Record the demo" as your last todo - the recording comes after the work is committed and\npushed, and ends as one GIF in ~/.infer/artifacts.</system-reminder>'}function ph(){return"<system-reminder>That tool call FAILED - the change did NOT happen. Re-read or re-check, fix it, and retry. Never mark a todo done or claim success on a failed call.</system-reminder>"}function nf(n){let h=["enabled: true","merge: true","reminders:"];for(let f of n){if(h.push(`  - name: ${JSON.stringify(f.name)}`),h.push(`    hook: ${JSON.stringify(f.hook)}`),h.push(`    trigger: ${JSON.stringify(f.trigger)}`),f.interval!==void 0)h.push(`    interval: ${f.interval}`);if(f.threshold!==void 0)h.push(`    threshold: ${f.threshold}`);h.push(`    text: ${JSON.stringify(f.text)}`)}return h.join(`
`)+`
`}function ln(n,h,f){let o=th(h,f),w=n.trim();if(!w)return nf(o);return hf(w,o)}function hf(n,h){let f=ff(n);if(!f)return`${n}
`;let o=f.reminders??[],w=new Set(o.map((a)=>a.name)),u=[...o,...h.filter((a)=>!w.has(a.name))];return`${JSON.stringify({...f,reminders:u})}
`}function ff(n){let h;try{h=Bun.YAML.parse(n)}catch{return}if(typeof h!=="object"||h===null||Array.isArray(h))return;let f=h.reminders;if(f!=null&&!Array.isArray(f))return;return h}import{execFileSync as of}from"child_process";import{appendFileSync as Mn,existsSync as oo,readFileSync as wf,rmSync as uf,writeFileSync as af}from"fs";var kf=60000;function Nn(){try{af(S,"1")}catch(n){console.error("[runner] failed to write cancel marker:",n)}}function En(){try{uf(S,{force:!0})}catch{}}var g=2,An=3;function In(n,h=v){try{return h(`git diff --stat origin/${yf(n)}...HEAD`)}catch(f){return console.error("[runner] git diff --stat failed:",f),""}}function _n(n,h=(f)=>f){try{let w=wf(F,"utf8").split(`
`).filter((u)=>u.trim()!=="").slice(-n);if(w.length===0)return;console.error("=========================================="),console.error(`[recover] last ${w.length} line(s) of agent activity before it stopped:`),console.error("------------------------------------------");for(let u of w){let a=u.length>2000?u.slice(0,2000)+" \u2026":u;console.error(h(a))}console.error("==========================================")}catch(f){console.error("[recover] could not read agent transcript for breadcrumb:",f)}}function v(n){return of("bash",["-c",n],{encoding:"utf8",timeout:kf,env:{...process.env,GIT_TERMINAL_PROMPT:"0"}})}function yf(n){return`'${n.replace(/'/g,"'\\''")}'`}function Q(n,h){let f=process.env.GITHUB_OUTPUT;if(!f){console.log(`(would set output) ${n}=${h}`);return}if(h.includes(`
`)){let o=`_GHO_EOF_${Math.random().toString(36).slice(2)}`;Mn(f,`${n}<<${o}
${h}
${o}
`)}else Mn(f,`${n}=${h}
`)}function gn(n){return typeof n==="object"&&n!==null&&n.role==="tool"&&typeof n.content==="string"}function vn(n){if(typeof n!=="object"||n===null)return!1;let h=n.type;return h==="compaction_started"||h==="compaction_completed"}var Sn="Result of tool call: ";function rn(n){let h=n.startsWith(Sn)?n.slice(Sn.length):n;if(!h.startsWith("{"))return null;try{let f=JSON.parse(h);if(typeof f==="object"&&f!==null)return f;return null}catch{return null}}class r{handlers=new Map;flushers=[];listeners=[];on(n,h){return this.handlers.set(n,h),this}onMessage(n){return this.listeners.push(n),this}addFlusher(n){return this.flushers.push(n),this}async observe(n){for await(let h of n){for(let w of this.listeners)try{w(h)}catch(u){console.error("[ticker] message listener threw:",u)}if(!gn(h))continue;let f=rn(h.content);if(!f?.tool_name)continue;let o=this.handlers.get(f.tool_name);if(!o)continue;try{await o(f,h)}catch(w){console.error(`[ticker] handler for ${f.tool_name} threw:`,w)}}}async flush(){for(let n of this.flushers)try{await n()}catch(h){console.error("[ticker] flusher threw:",h)}}}function Cn(n,h){let f=null,o=null,w=null,u=async()=>{if(o=null,!f)return;let a=f.value;f=null,w=n(a).catch((i)=>{console.error("[throttle] fn threw:",i)}).finally(()=>{w=null}),await w};return{call(a){if(f={value:a},!o)o=setTimeout(()=>{u()},h)},async flush(){if(o)clearTimeout(o),o=null;if(f)await u();else if(w)await w}}}function en(n){let h=Math.floor(n/1000);if(h<60)return`${h}s`;let f=Math.floor(h/60),o=h%60;if(f<60)return`${f}m ${o}s`;let w=Math.floor(f/60),u=f%60;return`${w}h ${u}m ${o}s`}var Rf=1500;async function Of(){let{dryRun:n,enableGitOps:h,redactor:f,github:o}=Rn(),w=q("INFER_REVIEW_MODE")==="true",u=h&&!w,a=q("INFER_COOKING_COMMENT_ID"),i=a?Number.parseInt(a,10):0,k=Number.isFinite(i)&&i>0,Y=G("INFER_AGENT_MODEL"),O=Hn(process.env,Y),J=q("INFER_CUSTOM_INSTRUCTIONS"),dn=q("INFER_BASH_ALLOW_APPEND"),C=q("INFER_LOGGING_DEBUG")==="true",V=Dn(process.env),$=await On(process.env,o,{stepName:"dry-run",failHard:!n});if($.kind==="pull_request"&&(h||w))try{jf($)}catch(y){if(!n)throw y;console.warn("[dry-run] PR head checkout failed; continuing on the current branch:",y instanceof Error?y.message:y)}let mn=$.kind==="pull_request"?In($.baseRef):"",tn=$.kind==="pull_request"?await o.getPrCheckRuns($.headRef):"",e=Un($,J),b=Fn($,{diffStat:mn,ciChecksSection:tn});if(u)for(let y of Gn($)){let W=y.key.replace(/^SYSTEM_/,"").toLowerCase().replace(/_/g,"-");process.stdout.write(`::warning::INFER_PROMPT_OVERRIDE_${y.key} replaces the bundled system prompt (system-prompt-${W} / src/prompts/system-${W}.md) and is missing the git-safety markers: ${y.missing.join(", ")}. The default guards against lost work (branch-first, commit-per-todo, push, draft PR, finish checklist); your override dropped those instructions, so the agent may leave changes uncommitted or unpushed. Re-add them to your override, or use the custom-instructions input to layer extras on top of the default instead of replacing it.
`)}let cn=q("INFER_REMINDERS_CONFIG"),L=q("INFER_COMPUTER_USE_RECORDING_ENABLED")==="true"&&Tn($),d=ln(cn,$,{enableGitOps:u,maxTurns:Number.parseInt(q("INFER_AGENT_MAX_TURNS"),10)||0,recordDemo:L,maxDurationMinutes:Number.parseInt(q("INFER_AGENT_MAX_DURATION_MINUTES"),10)||0}),m=on(u,dn,L),D=q("INFER_BIN")||"infer",xn=q("INFER_NO_COLOR")==="true",B=sf(process.env,{systemPrompt:e,bashAllowAppend:m,remindersYaml:d,reviewMode:w,recordDemo:L});console.log("=========================================="),console.log("SYSTEM PROMPT:"),console.log("==========================================");let t=q("INFER_BIN")?void 0:Jf(D,B);if(console.log(t===void 0?e:Zf(t,C)),console.log("=========================================="),console.log(""),console.log("Running agent with task:"),console.log(b),console.log("---"),n)console.log("=========================================="),console.log("DRY RUN - the agent would be invoked with:"),console.log("=========================================="),console.log(`Model:        ${Y}`),console.log(`Context kind: ${$.kind}`),console.log(`Git ops:      ${h?"enabled":"disabled"}`),console.log(`Review mode:  ${w?"enabled (Edit/Write/Delete disabled)":"disabled"}`),console.log(`INFER_BIN:    ${D}`),console.log("--- REMINDERS (INFER_REMINDERS_CONFIG) ---"),console.log(d),console.log("--- BASH ALLOW-LIST APPEND (added to the CLI read-only baseline) ---"),console.log(m||"(none - CLI read-only baseline only)"),console.log("==========================================");Pf(),En();let pn=Date.now(),c=["headless","--format","json-pretty","-m",Y,b];if(xn)c.push("--no-colors");let R=qf(D,c,{stdio:["inherit","pipe","pipe"],env:B});if(!R.stdout||!R.stderr)throw Error("child stdio not piped - this should not happen");let x=!1,p=!1,nn=(y)=>{if(p)return;p=!0,x=!0,Nn(),console.error(`[runner] received ${y}; stopping the agent so the salvage step can recover its work`);try{R.kill("SIGKILL")}catch(W){console.error("[runner] failed to stop agent child:",W)}};process.once("SIGTERM",()=>nn("SIGTERM")),process.once("SIGINT",()=>nn("SIGINT"));let X=Yf(F),hn=new $f;if(R.stdout.pipe(X,{end:!1}),V.stdout)R.stdout.pipe(process.stdout,{end:!1});else console.log("[runner] agent stdout muted (set mirror-agent-logs: true or debug: true to mirror); stderr still shown, full transcript written to /tmp/agent-output.txt");R.stdout.pipe(hn),R.stdout.on("end",()=>X.end()),R.stderr.on("data",(y)=>{if(X.write(y),V.stderr)process.stderr.write(y)});let j=new r,fn=[],Z=k?Cn(async(y)=>{let W=Hf(y,O);try{await o.updateZone(i,"plan",W),console.log(`[ticker] updated plan section (${y.length} todos)`)}catch(nh){console.error("[ticker] PATCH failed:",nh)}},Rf):null;if(Z)j.addFlusher(Z.flush),Z.call([]);else console.log("[ticker] no cooking comment; plan mirroring disabled (direct mode)");if(j.on("TodoWrite",(y)=>{let W=y.data?.todos;if(!Array.isArray(W))return;if(zf(W),fn=W,Z)Z.call(W)}),Kf(O,D,B,()=>{if(Z)Z.call(fn)}),C)j.onMessage((y)=>{if(vn(y)){console.log(y.type==="compaction_started"?"[agent] context compaction started (summarising older turns)\u2026":"[agent] context compaction completed");return}let W=y;if(W.role==="user"&&W.hidden===!0&&W.kind==="system_reminder")console.log("[agent] system reminder injected")});await j.observe(zn(hn)),await j.flush();let K=await Df(R),T=Date.now()-pn;if(console.log(""),console.log("=========================================="),console.log(`Agent exited with code ${K}`),console.log(`Duration: ${en(T)}`),console.log("=========================================="),x){if(Q("run-duration-ms",String(T)),await Xf(X),V.stdout)_n(40,f.redact);return console.error("[runner] cancelled mid-run; the salvage step will recover any work and report the timeout"),130}if(Q("exit-code",String(K)),Q("run-duration-ms",String(T)),K===g||K===An){let y=K===g?"turn limit":"time budget";return Q("result",`Agent stopped early (reached the ${y})`),console.error(`[runner] agent reached the ${y}; the salvage step will recover any unpushed work and the report renders a stopped-early status`),0}return Q("result",K===0?"Agent completed successfully":`Agent failed with exit code ${K}`),K}function Kf(n,h,f,o){if(q("INFER_BIN"))return;sn(h,f).then((w)=>{if(!w)return;console.log(`[runner] gateway version: ${w}`),n.gatewayVersion=Jn(w),Zn(n.gatewayVersion),o()}).catch((w)=>console.error("[runner] gateway version probe failed:",w))}function sf(n,h){return{...n,INFER_PROMPTS_AGENT_SYSTEM_PROMPT:h.systemPrompt,INFER_AGENT_SYSTEM_PROMPT_WITH_DEFAULTS:"true",INFER_TOOLS_BASH_ALLOW_APPEND:h.bashAllowAppend,INFER_REMINDERS_CONFIG:h.remindersYaml,INFER_REVIEW_INLINE:n.INFER_REVIEW_INLINE??"",INFER_COMPUTER_USE_RECORDING_ENABLED:String(h.recordDemo),...h.reviewMode?{INFER_TOOLS_EDIT_ENABLED:"false",INFER_TOOLS_WRITE_ENABLED:"false",INFER_TOOLS_DELETE_ENABLED:"false"}:{},OTEL_EXPORTER_OTLP_ENDPOINT:n.OTEL_EXPORTER_OTLP_ENDPOINT??"",OTEL_EXPORTER_OTLP_HEADERS:n.OTEL_EXPORTER_OTLP_HEADERS??"",OTEL_SERVICE_NAME:n.OTEL_SERVICE_NAME??"infer-action",OTEL_RESOURCE_ATTRIBUTES:n.OTEL_RESOURCE_ATTRIBUTES??""}}function Jf(n,h){try{let f=Wf(n,["debug","agent","system_prompt"],{env:h,encoding:"utf8",timeout:30000});if(f.status!==0||!f.stdout?.trim())return;return f.stdout}catch{return}}function Zf(n,h){if(h)return n;let f=n.indexOf("PERSISTENT MEMORY INDEX");if(f===-1)return n;let o=n.slice(f),w=o.indexOf(`

Current date:`),u=w===-1?"":o.slice(w);return`${n.slice(0,f)}PERSISTENT MEMORY INDEX: [redacted - set debug: true to include memory entries]${u}`}function Hf(n,h){let f=`${qn}

${Qn(h)}`;if(n.length===0)return`${f}

### Todos

_(agent has not posted a plan yet)_`;let o=n.map((w)=>{return`- ${w.status==="completed"?"[x]":w.status==="in_progress"?"[~]":"[ ]"} ${w.content}`});return[f,"","### Todos","",...o].join(`
`)}function Qf(n){let h=n.stderr;return((typeof h==="string"?h:"")+String(n.message)).includes("couldn't find remote ref")}function jf(n,h=v){try{if(n.isFork){let f=`pr-${n.prNumber}`;console.log(`[runner] fork PR; fetching pull/${n.prNumber}/head into ${f}`),h(`git fetch origin pull/${n.prNumber}/head:${f}`),h(`git checkout ${f}`)}else{console.log(`[runner] checking out PR head branch ${n.headRef}`);try{h(`git fetch origin ${n.headRef}`)}catch(f){if(!Qf(f))throw f;process.stdout.write(`::warning::PR head branch ${n.headRef} no longer exists on origin (likely deleted when the PR was closed or merged); recreating it from pull/${n.prNumber}/head. If the PR is closed or merged, pushing will not reopen it.
`),h(`git fetch origin pull/${n.prNumber}/head:${n.headRef}`)}h(`git checkout ${n.headRef}`)}}catch(f){throw Error(`Failed to check out PR head (${n.headRef}). Aborting before spawning the agent so it doesn't run against the wrong branch.`,{cause:f})}}async function Df(n){if(n.exitCode!==null)return n.exitCode;return new Promise((h)=>{n.on("close",(f)=>h(f??0))})}async function Xf(n){if(n.writableFinished)return;await Promise.race([new Promise((h)=>n.once("finish",h)),new Promise((h)=>setTimeout(h,2000).unref())])}function zf(n){try{bn(_,JSON.stringify(n))}catch(h){console.error("[runner] failed to persist todos:",h)}}function Pf(){try{bn(_,"[]")}catch{}}if(import.meta.main)Of().then((n)=>process.exit(n),(n)=>{console.error("[runner] uncaught error:",n),process.exit(1)});export{Jf as resolveMergedSystemPrompt,Hf as renderPlan,Zf as redactMemoryIndex,jf as ensurePrHeadCheckedOut,sf as buildChildEnv};
