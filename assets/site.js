
const toggle=document.querySelector('.menu-toggle');
const links=document.querySelector('.navlinks');
if(toggle&&links){toggle.addEventListener('click',()=>{const open=links.classList.toggle('open');toggle.setAttribute('aria-expanded',open?'true':'false');toggle.textContent=open?'✕':'☰';});links.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{links.classList.remove('open');toggle.setAttribute('aria-expanded','false');toggle.textContent='☰';}));}
