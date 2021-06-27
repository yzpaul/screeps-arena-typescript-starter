// Note that there is no global objects like Game or Memory.
//All methods, prototypes and constants are imported built-in modules
// import {
//   ATTACK,
//   CostMatrix,
//   HEAL,
//   RANGED_ATTACK,
//   RoomPosition,
//   getDirection,
//   getRange,
//   getObjectById,
//   getObjectsByPrototype,
//   getTime
// } from "game";

// Everything can be imported either from the root /game module or corresponding submodules
// import { pathFinder } from "game";
// pathFinder.searchPath();
// import { prototypes } from "game";
// prototypes.Creep
// prototypes.RoomObject

// import {searchPath } from '/game/path-finder';
// import {Creep} from '/game/prototypes';

// This would work too:
// import * as PathFinder from '/game/path-finder'; --> PathFinder.searchPath
// import {Creep} from '/game/prototypes/creep';
// import * as prototypes from '/game/prototypes'; --> prototypes.Creep

// This stuff is arena-specific
import { ATTACK, HEAL, RANGED_ATTACK, TOUGH } from "game/constants";
import { BodyPart, Flag } from "arena";
import { Creep, RoomObject, StructureTower } from "game/prototypes";
import { getDirection, getDistance, getObjectsByPrototype, getRange, getTime } from "game/utils";
import { searchPath } from "game/path-finder";

/*
TODO
loss due to units not concentrated when moving to rally - break into squads
*/

declare module "game/prototypes" {
  interface Creep {
    initialPos: RoomPosition;
    sgt: boolean;
    isBaseHealer: boolean;
    squad: number;
  }
}
// You can also import your files like this:
// import {roleAttacker} from './roles/attacker.mjs';

// We can define global objects that will be valid for the entire match.
// The game guarantees there will be no global reset during the match.
// Note that you cannot assign any game objects here, since they are populated on the first tick, not when the script is initialized.
let myCreeps: Creep[];
let enemyCreeps: Creep[];
let enemyFlag: Flag;
let myFlag: Flag;
let myTower: StructureTower;
let isEnemyOutOfRangedUnits: boolean = false;
let corner: number; //the corner of avail able square eg 9 or 81 for (9,9) or (81,81)
let firstrally: { x: number; y: number }; //enemy side of map
let rally: { x: number; y: number };
//only 2 squds will be created
let squads: Creep[][] = [[],[]];
let atkTime = 1700;
// This is the only exported function from the main module. It is called every tick.
export function loop(): void {
  // We assign global variables here. They will be accessible throughout the tick, and even on the following ticks too.
  // getObjectsByPrototype function is the alternative to Room.find from Screeps World.
  // There is no Game.creeps or Game.structures, you can manage game objects in your own way.
  myCreeps = getObjectsByPrototype(Creep).filter(i => i.my);
  enemyCreeps = getObjectsByPrototype(Creep).filter(i => !i.my);
  enemyFlag = getObjectsByPrototype(Flag).find(i => !i.my)!;
  myFlag = getObjectsByPrototype(Flag).find(i => i.my)!;
  myTower = getObjectsByPrototype(StructureTower).find(i => i.my)!;
  isEnemyOutOfRangedUnits =
    enemyCreeps.filter(e => e.body.some(i => i.type === RANGED_ATTACK && i.hits > 0)).length <= 0;

  if (myTower) {
    let clo: Creep | undefined = myTower.findClosestByRange(enemyCreeps);
    let mine: Creep | undefined = myTower.findClosestByRange(myCreeps.filter(x=>x.hits<x.hitsMax));

    //let isHalfEnergy = myTower.store.energy > myTower.store.getCapacity() / 2;
    if (clo && getDistance(clo, myTower) <= 12) {
      myTower.attack(clo);
    }
    else if (mine && isEnemyOutOfRangedUnits) {
      myTower.heal(mine);
    }
  }

  //if at least half creeps at rally with FULL HEALTH
  //or the enemy is out of ranged units (in case rally point is a rock)
  //or 300 ticks left in match
  let readyToAtk = firstrally ? myCreeps.filter(c => c.hits >= c.hitsMax && getDistance(c, firstrally) < 2).length : 0;
  let atkUnits = (myCreeps.length - 3) / 2; //subtract melee guys and basehealer

  if (isEnemyOutOfRangedUnits || readyToAtk > atkUnits || getTime() > atkTime) {
    rally = { x: enemyFlag.x, y: enemyFlag.y };
    console.log(`CHARGE!!!! to ${JSON.stringify(rally)} at ${getTime()}`);
  }
  //else if (getTime() % 10 == 0) console.log(`waiting for forces: ${readyToAtk} out of ${myCreeps.length / 2} needed`);

  myCreeps.forEach((creep: Creep) => {
    //initial setup
    // Here is the alternative to the creep "memory" from Screeps World.
    //All game objects are persistent. You can assign any property to it once,
    //and it will be available during the entire match.
    if (!creep.initialPos) {
      creep.squad = setSquad(creep);
      creep.initialPos = { x: creep.x, y: creep.y };
      if (myTower!.x == 4) {
        corner = 8;
        firstrally = { x: 56, y: 72 };
      }
      //bottom of map
      else {
        corner = 91;
        firstrally = { x: 33, y: 26 };
      }
      rally = firstrally;

      //set base healer
      if (creep.squad === 99 && creep.body.some(i => i.type === HEAL))
        creep.isBaseHealer = true;
      else creep.isBaseHealer = false;
    }
    //end initial setup

    if (creep.body.some(i => i.type === ATTACK)) {
      meleeAttacker(creep);
    }
    if (creep.body.some(i => i.type === RANGED_ATTACK)) {
      rangedAttacker(creep);
    }
    if (creep.body.some(i => i.type === HEAL)) {
      if (creep.isBaseHealer) baseHealer(creep);
      else healer(creep);
    }
  });
}

//figures out which "class" the unit is in
//assigns it to a squad (based on how many empty arrays there are in "squads")
//returns the number of the squad
//4 ranged, 1 healer per squad- with 2 melee and one healer as squad "99" at base
function setSquad(creep: Creep): number {
  let specialpart = creep.body.some(i => i.type === HEAL) ? HEAL : creep.body.some(i => i.type === RANGED_ATTACK)?RANGED_ATTACK:ATTACK;
  //leaves 2 melee and two healers at base
  let squadComp={"heal":2,"attack":0,"ranged_attack":3}

  let idx=0;
  for(let s of squads){
    let maxAmt=squadComp[specialpart]
    if (s.filter(a => a.body.some(i => i.type === specialpart)).length < maxAmt) {
      s.push(creep);
      console.log(`added creep: ${specialpart} id: ${creep.id} to squad: ${idx}`)
      return idx;
    }
    idx+=1
  }
  console.log(squads)

  return 99;
}

function meleeAttacker(creep: Creep) {
  //hunt range 100 when enemy is out of guys, or when round almost over
  let huntDistance = isEnemyOutOfRangedUnits || getTime() > atkTime - 200 ? 100 : 10;
  const targets = enemyCreeps
    .filter(i => getDistance(i, creep.initialPos) < huntDistance)
    .sort((a, b) => getDistance(a, creep) - getDistance(b, creep));

  let hasDefLeft = creep.body.filter(i => i.type === TOUGH && i.hits > 0).length > 1;

  if (hasDefLeft && targets.length > 0) {
    creep.moveTo(targets[0]);
    creep.attack(targets[0]);
  } else if (hasDefLeft && huntDistance > 10) {
    //ignore healer/melee and charge for flag
    creep.moveTo(enemyFlag);
  } else if (creep.hits < creep.hitsMax) {
    if (huntDistance > 10) {
      //no retreat
      //move to CLOSEST healer (to get healed) if damaged at all
      creep.moveTo(creep.findClosestByRange(myCreeps.filter(c => c.body.some(i => i.type === HEAL))));
    } else {
      //move to base healer
      creep.moveTo(myCreeps.filter(c => c.isBaseHealer)[0]);
    }
  } else creep.moveTo(creep.initialPos);
}

function rangedAttacker(creep: Creep) {
  let threats = enemyCreeps
    .filter(
      i =>
        getDistance(creep, i) <= 3 && i.body.some(i => i.type === RANGED_ATTACK || i.type === ATTACK || i.type === HEAL)
    )
    .sort((a, b) => getDistance(a, creep) - getDistance(b, creep));

  //can HIT at range of 3, but threat (so can flee) evaluated at range of 4
  if (threats.length == 1) {
    creep.rangedAttack(threats[0]);
  } else creep.rangedMassAttack();

  if (creep.hits >= creep.hitsMax / 2) {
    creep.moveTo(rally);
  } else {
    //if hurt move to CLOSEST healer
    creep.moveTo(creep.findClosestByPath(myCreeps.filter(c => c.body.some(i => i.type === HEAL))));
    return;
  }
}

function healer(creep: Creep) {
  //console.log(`h:${creep.id}`)

  if (creep.hits >= creep.hitsMax) {
    const healTarget = myCreeps
      .filter(i => getRange(i, creep) <= 3 && i.hits < i.hitsMax)
      .sort((a, b) => a.hits - b.hits)[0];

    if (healTarget) {
      if (getRange(healTarget, creep) === 1) {
        creep.heal(healTarget);
      } else {
        creep.rangedHeal(healTarget);
      }
    }
  } else creep.heal(creep);

  const range = 3;

  //only dangerous enemies
  const enemiesInRange = enemyCreeps.filter(
    i => getDistance(i, creep) < range && i.body.some(i => (i.type === RANGED_ATTACK || i.type === ATTACK)&&i.hits>0)
  );
  //only allowed to flee if not in final time
  if (enemiesInRange.length > 0 && getTime() < atkTime) {
    flee(creep, enemiesInRange, range);
  } else {
    creep.moveTo(rally);
  }
}

function flee(creep: Creep, targets: Creep[], range: number) {
  //only the ones that can hurt
  targets = targets.filter(t =>
    t.body.some(i => (i.type === ATTACK && i.hits > 0) || (i.type === RANGED_ATTACK && i.hits > 0))
  );
  if (targets) {
    const result = searchPath(
      creep,
      targets.map(i => ({ pos: i, range })),
      { flee: true }
    );
    if (result.path.length > 0) {
      const direction = getDirection(result.path[0].x - creep.x, result.path[0].y - creep.y);
      creep.move(direction);
    }
  }
}
//stays at home to heal units
function baseHealer(creep: Creep) {
  const healTargets = myCreeps
    .filter(i => getDistance(i, creep) <= 3 && i.hits < i.hitsMax)
    .sort((a, b) => a.hits - b.hits);

  if (healTargets.length > 0) {
    if (getDistance(healTargets[0], creep) === 1) {
      creep.heal(healTargets[0]);
    } else {
      creep.rangedHeal(healTargets[0]);
    }
  }
  creep.moveTo(myFlag);
}
