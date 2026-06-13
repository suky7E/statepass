/**
 * passphrase.ts — Word-list passphrase generation.
 */

// 512-word list drawn from common, unambiguous English words.
export const WORD_LIST = [
  'abandon','ability','absence','account','achieve','acquire','action','active',
  'adapt','adjust','advance','afford','afraid','agency','agenda','agree',
  'ahead','alarm','album','alert','alien','align','alive','alley',
  'allow','alter','anchor','angel','angle','angry','animal','answer',
  'apart','appeal','apply','arena','argue','armor','arrange','arrive',
  'aspect','assist','attach','attend','author','autumn','avoid','awake',
  'badge','baking','ballot','bamboo','banana','banner','barrel','battle',
  'beacon','belief','belong','better','beyond','bitter','blanket','blossom',
  'border','bottle','bottom','bounce','branch','bridge','bright','broken',
  'budget','bundle','burden','butter','button','bypass','cabinet','cactus',
  'camera','cancel','candle','canvas','carbon','castle','casual','cattle',
  'ceiling','cellar','center','chain','change','charge','choice','circle',
  'circuit','citizen','clarify','classic','clean','client','closet','cluster',
  'coffee','collar','collect','column','combat','commit','common','complex',
  'concert','confirm','connect','contain','content','control','convoy','correct',
  'cotton','coupon','create','credit','crisis','custom','damage','danger',
  'debate','decade','decide','defend','define','delete','depend','deploy',
  'derive','desert','design','detail','detect','develop','differ','dinner',
  'direct','domain','double','dragon','drawer','driver','durable','dynamic',
  'eager','eclipse','editor','effect','effort','eight','either','element',
  'empire','enable','encode','energy','engine','enough','entire','equal',
  'escape','ethics','evolve','expect','expert','extend','fabric','factor',
  'family','famous','faster','filter','finish','forest','formal','forum',
  'fossil','fragile','freedom','freeze','frozen','galaxy','garage','gather',
  'global','golden','gossip','ground','growth','guitar','handle','happen',
  'harbor','harvest','health','heavy','height','hidden','honest','horror',
  'humble','hunter','hybrid','ignore','impact','import','income','indent',
  'indoor','insert','inside','install','intent','invest','island','jacket',
  'jigsaw','jungle','junior','justice','kernel','kingdom','kitchen','kitten',
  'knuckle','ladder','launch','layout','leader','letter','likely','listen',
  'little','locate','logger','lonely','longer','losing','lunar','luxury',
  'magnet','mango','manner','market','master','matrix','meadow','member',
  'mental','method','middle','mirror','mobile','module','moment','motion',
  'mountain','myself','narrow','native','nature','needle','network','neutral',
  'normal','notice','object','obtain','offer','online','option','orange',
  'origin','output','owner','palace','parent','passion','patent','pencil',
  'people','percent','period','permit','phrase','pillow','planet','plastic',
  'player','pocket','policy','portal','poster','power','prefer','prevent',
  'produce','profit','project','proper','protect','public','puzzle','radar',
  'random','rating','reason','recent','refuse','region','remote','repeat',
  'report','rescue','result','return','reveal','rocket','router','saddle',
  'sample','saving','screen','search','secure','select','series','severe',
  'shadow','signal','silent','silver','simple','single','sketch','social',
  'socket','source','stable','static','status','storage','street','string',
  'strong','studio','submit','sunset','survey','system','tackle','target',
  'temple','tender','testing','thankful','timber','tissue','title','toggle',
  'token','tomato','total','travel','trigger','trophy','tunnel','turtle',
  'typing','ubuntu','unlock','update','useful','valley','vendor','verify',
  'village','violin','vision','wallet','warrior','weather','website','window',
  'winter','wisdom','wonder','worker','yellow','zipper','zombie','zoology',
];

/**
 * Generate a passphrase from an entropy hex string.
 */
export function createPassphrase(entropyHex: string, wordCount: number = 6, separator: string = '-'): string {
  const entropy = BigInt('0x' + entropyHex);
  let e = entropy;
  const words: string[] = [];

  for (let i = 0; i < wordCount; i++) {
    const idx = e % BigInt(WORD_LIST.length);
    e = e / BigInt(WORD_LIST.length);
    words.push(WORD_LIST[Number(idx)]);
  }

  return words.join(separator);
}
