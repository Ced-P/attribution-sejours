// Tests du moteur d'attribution (calculs purs, sans navigateur).
// Lancer : node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// On extrait CONFIG, les données de démonstration et le moteur directement depuis index.html,
// pour tester exactement le code livré.
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const debut = html.indexOf('<script>\n') + '<script>\n'.length;
const fin = html.indexOf('/* ═══════════════ APPLICATION');
const { CONFIG, DATA_INTEGREES, ENGINE: E } = new Function(html.slice(debut, fin) + '\nreturn {CONFIG, DATA_INTEGREES, ENGINE};')();

const N = CONFIG.annee;
const P = { modeA: 'iteratif', noteMode: 'cumul', noelMin: 7, semComplete: ['Printemps'],
            ordre: ['semaine', 'premier', 'anciennete', 'service'], ajust: {}, exclus: {}, forces: [] };

const foyer = (nom, prenom, ...choix) => ({ corresp: '', branche: '(1) Test', horodateur: '', email: '', nom, prenom,
  option: '', commentaire: '', choix: [...choix, null, null, null].slice(0, 3) });

const DATA = {
  hist: [
    [N - 1, `${N - 1}-07-10`, `${N - 1}-07-17`, 'ALPHA', 'ADA', '1.1', '1'],   // été N-1 : note 4
    [2019, '2019-06-07', '2019-06-14', 'GAMMA', 'GABY', '1.3', '1'],              // dernier séjour ancien
    [N - 2, `${N - 2}-03-14`, `${N - 2}-03-21`, 'DELTA', 'DESIRE', '1.4', '1'],   // hors vacances N-2 : note 1
  ],
  refus: [[N - 3, 'GAMMA', 'GABY', '1.3']],                                       // refus 5 ans après : bonus −1
  foyers: [
    foyer('Alpha', 'Ada', [`${N}-07-02`, `${N}-07-09`]),
    foyer('Beta', 'Basile', [`${N}-07-02`, `${N}-07-09`]),
    foyer('Gamma', 'Gaby', [`${N}-11-12`, `${N}-11-19`]),
    foyer('Delta', 'Désiré', [`${N}-08-06`, `${N}-08-20`]),                         // 14 nuits : non examinée
    foyer('Epsilon', 'Eulalie', [`${N}-04-09`, `${N}-04-16`]),                        // semaine de printemps
    foyer('Zeta', 'Zélie', [`${N}-04-09`, `${N}-04-11`]),                           // week-end sur la même période
    foyer('Eta', 'Hilaire', [`${N}-12-24`, `${N}-12-26`]),                           // Noël, 2 nuits
  ],
};

function calcul(data = DATA, p = P) {
  const base = E.preparer(data);
  const r = E.rapprocher(data, base, {}, p.noteMode);
  const res = E.attribuer(r.foyers, r.demandes, p);
  const parNom = Object.fromEntries(r.foyers.map(f => [f.nom, f]));
  const attribue = nom => res.attrib.find(a => a.d.fid === parNom[nom].id);
  return { ...r, ...res, parNom, attribue };
}

test('note de priorité : barème et bonus refus', () => {
  const { parNom } = calcul();
  assert.equal(parNom.Alpha.score, 4, 'séjour en vacances l\'an dernier');
  assert.equal(parNom.Beta.score, 0, 'jamais venu');
  assert.equal(parNom.Gamma.score, -1, 'refus au moins 4 ans après le dernier séjour');
  assert.equal(parNom.Delta.score, 1, 'séjour hors vacances il y a deux ans');
});

test('la note la plus basse l\'emporte sur un créneau disputé', () => {
  const { attribue, nonServis, parNom } = calcul();
  assert.equal(attribue('Beta').etape, 'B');
  assert.ok(nonServis.includes(parNom.Alpha.id));
});

test('un foyer seul sur ses dates les obtient directement', () => {
  assert.equal(calcul().attribue('Gamma').etape, 'A');
});

test('au-delà de nuitsMax, la demande n\'est pas examinée', () => {
  const { demandes, parNom } = calcul();
  const d = demandes.find(x => x.fid === parNom.Delta.id);
  assert.equal(d.valide, false);
});

test('semaine complète prioritaire pendant les vacances choisies', () => {
  const { attribue, nonServis, parNom } = calcul();
  const a = attribue('Epsilon');
  assert.ok(a, 'la semaine complète est servie');
  assert.ok(a.motifs.includes('semaine complète prioritaire'));
  assert.ok(nonServis.includes(parNom.Zeta.id));
});

test('séjour trop court à Noël : non recevable', () => {
  const { irrecevables, parNom } = calcul();
  assert.ok(irrecevables.some(x => x.fid === parNom.Eta.id));
});

test('une décision forcée du comité est respectée', () => {
  const sans = calcul();
  const cleAlpha = sans.demandes.find(x => x.fid === sans.parNom.Alpha.id).cle;
  const avec = calcul(DATA, { ...P, forces: [cleAlpha] });
  assert.equal(avec.attribue('Alpha').etape, 'F');
  assert.ok(!avec.attribue('Beta'), 'Beta perd le créneau');
});

test('données de démonstration : un séjour par foyer, aucun chevauchement', () => {
  const { attrib } = calcul(DATA_INTEGREES);
  const foyers = attrib.map(a => a.d.fid);
  assert.equal(new Set(foyers).size, foyers.length);
  for (let i = 0; i < attrib.length; i++)
    for (let j = i + 1; j < attrib.length; j++)
      assert.ok(!E.chevauche(attrib[i].d, attrib[j].d), `${attrib[i].d.cle} / ${attrib[j].d.cle}`);
});
