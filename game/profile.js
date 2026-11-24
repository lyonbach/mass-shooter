export function createProfile(runtime){
  const {$,g,read,write,t}=runtime,input=$('callsign-input'),error=$('callsign-error');
  const normalize=value=>value.normalize('NFC').trim().replace(/\s+/gu,' ');
  const valid=value=>[...value].length>=2&&[...value].length<=16&&/^[\p{L}\p{N}][\p{L}\p{M}\p{N} _-]*$/u.test(value);
  const stored=read('blackout.playerName','');
  g.playerName=typeof stored==='string'&&valid(normalize(stored))?normalize(stored):'';
  function prepareCallsign(){
    input.value=g.playerName;input.removeAttribute('aria-invalid');error.textContent='';
  }
  input.addEventListener('input',()=>{input.removeAttribute('aria-invalid');error.textContent='';});
  $('callsign-form').addEventListener('submit',event=>{
    event.preventDefault();
    const name=normalize(input.value);
    if(!valid(name)){
      error.textContent=t('callsign.invalid');input.setAttribute('aria-invalid','true');input.focus();return;
    }
    g.playerName=name;
    const saved=write('blackout.playerName',name);
    runtime.closeSettings();
    if(!saved)runtime.announce(t('callsign.label'),t('callsign.sessionOnly'),'',5);
  });
  $('callsign-edit').addEventListener('click',()=>runtime.openSettings('callsign'));
  return {prepareCallsign};
}
