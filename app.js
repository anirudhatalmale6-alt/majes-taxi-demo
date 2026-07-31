/* TaxiMajes — demo interactivo del flujo del pasajero (Majes / El Pedregal, Arequipa)
   Solo demostración: mapa real (OpenStreetMap) + ruta real (OSRM) + conductor simulado. */

// ----- Ubicación base: El Pedregal, Majes -----
const ORIGIN = [-16.3627, -72.1908];
const PRESETS = [
  { name: 'Plaza de Armas',        c: [-16.3648, -72.1935] },
  { name: 'Mercado Municipal',     c: [-16.3585, -72.1874] },
  { name: 'Terminal Terrestre',    c: [-16.3705, -72.1849] },
  { name: 'Ciudad Majes (Módulos)',c: [-16.3520, -72.1990] },
  { name: 'Hospital de Majes',     c: [-16.3567, -72.2012] },
];

const DRIVER = { name:'Carlos M.', car:'Toyota Yaris · Blanco', plate:'V7A-482', rating:'4.9', initial:'C' };

let map, origMarker, destMarker, carMarker, routeLine;
let dest = null, routeCoords = null, distKm = 0, durMin = 0;
let price = 6.0, pay = 'efectivo', carTimer = null;

// ----- Utilidades -----
const $ = (id) => document.getElementById(id);
function toast(msg){ const t=$('toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('show'),2200); }
function show(step){ document.querySelectorAll('.step').forEach(s=>s.classList.remove('active')); $(step).classList.add('active'); }
function haversine(a,b){ const R=6371,dLat=(b[0]-a[0])*Math.PI/180,dLon=(b[1]-a[1])*Math.PI/180,
  la1=a[0]*Math.PI/180,la2=b[0]*Math.PI/180;
  const h=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(h)); }

function icon(emoji,cls){ return L.divIcon({html:emoji, className:'', iconSize:[30,30], iconAnchor:[15,15]}); }
function pinIcon(color){ return L.divIcon({
  html:`<div style="width:18px;height:18px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:2px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,.5)"></div>`,
  className:'', iconSize:[18,18], iconAnchor:[9,16] }); }

// ----- Init mapa -----
function initMap(){
  map = L.map('map', { zoomControl:false, attributionControl:true }).setView(ORIGIN, 14);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19, subdomains:'abcd',
    attribution: '&copy; OpenStreetMap · &copy; CARTO'
  }).addTo(map);
  L.control.zoom({position:'topright'}).addTo(map);

  origMarker = L.marker(ORIGIN, {icon:pinIcon('#25d366')}).addTo(map).bindTooltip('Tu ubicación',{direction:'top',offset:[0,-14]});
  map.on('click', (e)=> setDest([e.latlng.lat, e.latlng.lng], 'Punto en el mapa'));

  const box = $('presets');
  PRESETS.forEach(p=>{
    const c=document.createElement('div'); c.className='chip'; c.textContent=p.name;
    c.onclick=()=>{ setDest(p.c, p.name); map.setView(p.c, 14); };
    box.appendChild(c);
  });
}

function setDest(c, label){
  dest = c;
  $('destLbl').textContent = label;
  $('btnRoute').disabled = false;
  if(destMarker) map.removeLayer(destMarker);
  destMarker = L.marker(c, {icon:pinIcon('#ff5a5a')}).addTo(map).bindTooltip(label,{direction:'top',offset:[0,-14]});
  const b = L.latLngBounds([ORIGIN, c]).pad(0.35);
  map.fitBounds(b, {paddingTopLeft:[20,90], paddingBottomRight:[20,60]});
}

// ----- Ruta (OSRM real, con respaldo a línea recta) -----
async function buildRoute(){
  $('btnRoute').textContent = 'Calculando ruta…'; $('btnRoute').disabled = true;
  let coords=null, dist=null, dur=null;
  try{
    const url=`https://router.project-osrm.org/route/v1/driving/${ORIGIN[1]},${ORIGIN[0]};${dest[1]},${dest[0]}?overview=full&geometries=geojson`;
    const r = await fetch(url); const j = await r.json();
    if(j.routes && j.routes[0]){
      coords = j.routes[0].geometry.coordinates.map(p=>[p[1],p[0]]);
      dist = j.routes[0].distance/1000; dur = j.routes[0].duration/60;
    }
  }catch(e){ /* respaldo abajo */ }

  if(!coords){ // respaldo si OSRM no responde
    coords = [ORIGIN, dest];
    dist = haversine(ORIGIN, dest) * 1.35;   // factor calle
    dur  = dist / 25 * 60;                    // ~25 km/h urbano
  }
  routeCoords = coords; distKm = dist; durMin = Math.max(2, Math.round(dur));

  if(routeLine) map.removeLayer(routeLine);
  routeLine = L.polyline(coords, {color:'#ffcf3f', weight:5, opacity:.9}).addTo(map);
  map.fitBounds(routeLine.getBounds(), {paddingTopLeft:[24,90], paddingBottomRight:[24,320]});

  $('stKm').textContent  = distKm.toFixed(1)+' km';
  $('stMin').textContent = durMin+' min';

  // precio sugerido: base S/3 + S/1.2 por km, redondeado a 0.5
  const sugg = Math.max(4, Math.round((3 + distKm*1.2)*2)/2);
  price = sugg; renderPrice();
  $('capSugg').textContent = 'Sugerido S/'+sugg.toFixed(1);
  $('suggTxt').textContent = 'Puedes ofrecer más o menos. El conductor decide si acepta.';
  $('btnRoute').textContent = 'Ver ruta y precio'; $('btnRoute').disabled = false;
  show('s2');
}

function renderPrice(){ $('priceVal').textContent = price.toFixed(1); }

// ----- Buscar + conductor simulado -----
function search(){
  $('searchSub').textContent = `Enviando tu oferta de S/${price.toFixed(1)} (${pay}) a los taxis disponibles en El Pedregal…`;
  show('s3');
  setTimeout(()=>{ acceptRide(); }, 2600);
}

function acceptRide(){
  show('s4');
  $('drvName').textContent = DRIVER.name; $('drvAv').textContent = DRIVER.initial;
  $('drvCar').textContent = DRIVER.car; $('drvPlate').textContent = DRIVER.plate;
  $('s4title').textContent = `¡${DRIVER.name.split(' ')[0]} aceptó por S/${price.toFixed(1)}! 🎉`;
  toast('Conductor asignado · '+DRIVER.name);

  // taxi arranca desde un punto cercano al origen y se acerca
  const start = [ORIGIN[0]+0.010, ORIGIN[1]+0.012];
  if(carMarker) map.removeLayer(carMarker);
  carMarker = L.marker(start, {icon: L.divIcon({html:'🚕', className:'', iconSize:[30,30], iconAnchor:[15,15]})}).addTo(map);
  carMarker.bindTooltip(`<span class="carlabel">${DRIVER.plate} · llega en ${durMin>6?4:durMin} min</span>`,{permanent:true,direction:'top',offset:[0,-12]});

  const path = [start,
    [ORIGIN[0]+0.006, ORIGIN[1]+0.005],
    [ORIGIN[0]+0.002, ORIGIN[1]+0.002],
    ORIGIN];
  animateCar(path, 0);
  countdownEta();
}

function animateCar(path, i){
  if(i>=path.length-1){ carMarker.setLatLng(ORIGIN); toast('🚕 Tu taxi está llegando'); return; }
  const from=path[i], to=path[i+1]; let t=0;
  clearInterval(carTimer);
  carTimer=setInterval(()=>{
    t+=0.04; if(t>=1){ t=1; clearInterval(carTimer); carMarker.setLatLng(to); animateCar(path,i+1); }
    const lat=from[0]+(to[0]-from[0])*t, lon=from[1]+(to[1]-from[1])*t;
    carMarker.setLatLng([lat,lon]);
  }, 45);
}

function countdownEta(){
  let min = durMin>6?4:durMin;
  $('eta').textContent = `Llega en ${min} min`;
  const iv=setInterval(()=>{
    min--; if(min<=0){ clearInterval(iv); $('eta').textContent='🚕 Tu taxi llegó · ¡Buen viaje!'; return; }
    $('eta').textContent = `Llega en ${min} min`;
  }, 3500);
}

function restart(){
  clearInterval(carTimer);
  if(carMarker) map.removeLayer(carMarker);
  if(routeLine) map.removeLayer(routeLine);
  if(destMarker) map.removeLayer(destMarker);
  dest=null; routeCoords=null;
  $('destLbl').textContent='Toca el mapa o elige abajo…';
  $('btnRoute').disabled=true;
  map.setView(ORIGIN,14);
  show('s1');
}

// ----- Eventos UI -----
window.addEventListener('load', ()=>{
  initMap();
  $('btnRoute').onclick = buildRoute;
  $('btnSearch').onclick = search;
  $('back2').onclick = ()=>show('s1');
  $('minus').onclick = ()=>{ price=Math.max(2, +(price-0.5).toFixed(1)); renderPrice(); };
  $('plus').onclick  = ()=>{ price=+(price+0.5).toFixed(1); renderPrice(); };
  document.querySelectorAll('.pay').forEach(p=>p.onclick=()=>{
    document.querySelectorAll('.pay').forEach(x=>x.classList.remove('sel'));
    p.classList.add('sel'); pay=p.dataset.pay;
  });
  $('btnChat').onclick = ()=>toast('💬 Chat interno (demo)');
  $('btnCall').onclick = ()=>toast('📞 Llamada protegida — sin mostrar tu número (demo)');
  $('btnShare').onclick= ()=>toast('🛡️ Viaje compartido con tu familiar (demo)');
  $('btnRestart').onclick = restart;
});
