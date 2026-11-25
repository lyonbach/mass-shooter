const SCORES_URL='https://ltb22rfjxf66txpe2jlgzomwkm0qyqbo.lambda-url.eu-central-1.on.aws/scores';

export function createScores(runtime){
  const {$,g,settings,t}=runtime,list=$('high-scores'),status=$('scores-status'),submit=$('score-submit');
  const overView={list,status,refresh:$('scores-refresh'),loading:false};
  const hallView={list:$('hall-scores'),status:$('hall-status'),refresh:$('hall-refresh'),loading:false};
  let run=null;

  async function loadScores(view=overView){
    if(view.loading)return;
    view.loading=true;view.refresh.disabled=true;
    const {list,status}=view;
    const current=run;
    status.textContent=t('scores.loading');
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
    try{
      const response=await fetch(`${SCORES_URL}?limit=10`,{signal:controller.signal,cache:'no-store'});
      if(!response.ok)throw new Error(`Score lookup failed: HTTP ${response.status}`);
      const data=await response.json();
      if(!Array.isArray(data.scores)||!data.scores.every(item=>item&&typeof item.name==='string'&&item.name.length<=128&&Number.isSafeInteger(item.score)&&item.score>=0))throw new Error('Invalid leaderboard response');
      if(view===overView&&current!==run)return;
      list.replaceChildren();
      for(const entry of data.scores.slice(0,10)){
        const row=document.createElement('li'),name=document.createElement('span'),score=document.createElement('strong');
        name.textContent=entry.name;score.textContent=entry.score.toLocaleString(settings.language);
        row.append(name,score);list.append(row);
      }
      status.textContent=data.scores.length?'':t('scores.empty');
    }catch(error){
      console.warn('Unable to load leaderboard',error);
      if(view!==overView||current===run)status.textContent=t('scores.unavailable');
    }finally{
      clearTimeout(timeout);view.loading=false;view.refresh.disabled=false;
      if(view===overView&&current!==run&&g.state==='over')void loadScores();
    }
  }

  function showScores(){
    run={score:g.score,attempted:false,pending:false};
    $('scores-section').hidden=Boolean(g.testRange);
    submit.disabled=false;$('score-submit-status').textContent='';
    list.replaceChildren();
    if(!g.testRange)void loadScores();
  }

  async function submitScore(){
    if(g.state!=='over'||g.testRange||!run||run.attempted||run.pending)return;
    if(!g.playerName){runtime.openSettings('callsign');return;}
    const current=run,name=g.playerName;
    current.pending=true;current.attempted=true;submit.disabled=true;
    $('score-submit-status').textContent=t('scores.sending');
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
    try{
      const response=await fetch(SCORES_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,score:current.score}),signal:controller.signal});
      if(current!==run)return;
      if(response.status===429){
        $('score-submit-status').textContent=t('scores.limited');
        return;
      }
      if(!response.ok)throw new Error(`Score submission failed: HTTP ${response.status}`);
      $('score-submit-status').textContent=t('scores.saved');
      void loadScores();
    }catch(error){
      console.warn('Unable to confirm score submission',error);
      if(current===run)$('score-submit-status').textContent=t('scores.uncertain');
    }finally{
      clearTimeout(timeout);current.pending=false;
    }
  }

  submit.addEventListener('click',submitScore);
  $('scores-refresh').addEventListener('click',()=>void loadScores());
  $('hall-open').addEventListener('click',()=>{
    runtime.openSettings('hall');
    void loadScores(hallView);
  });
  $('hall-refresh').addEventListener('click',()=>void loadScores(hallView));
  $('hall-done').addEventListener('click',()=>runtime.closeSettings());
  return {showScores};
}
