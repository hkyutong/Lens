'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),Module=require('module');
const ROOT=path.resolve(__dirname,'../..');
const ts=require('typescript');
const FILE=path.join(ROOT,'admin/src/views/package/package.vue');
function inspect(){
 const full=fs.readFileSync(FILE,'utf8'),match=full.match(/<script\b[^>]*>([\s\S]*?)<\/script>/);if(!match)throw 0;
 const sf=ts.createSourceFile('package.ts',match[1],ts.ScriptTarget.Latest,true);let usd;
 function rules(n){if(ts.isPropertyAssignment(n)&&ts.isArrayLiteralExpression(n.initializer)&&/请输入大于零的美元售价/.test(n.initializer.getText(sf)))usd=n;ts.forEachChild(n,rules)}rules(sf);if(!usd)throw 0;
 const field=usd.name.getText(sf),item=[...full.matchAll(/<el-form-item\b([^>]*?)>([\s\S]*?)<\/el-form-item>/g)].find(m=>new RegExp('prop\\s*=\\s*[\'"]'+field+'[\'"]').test(m[1]));if(!item)throw 0;
 const binding=/v-model(?:\.[\w-]+)*\s*=\s*['"]([^'"]+)/.exec(item[2])?.[1];if(!binding||binding.split('.').length!==2)throw 0;const formName=binding.split('.')[0];let copy;
 function find(n){if(ts.isCallExpression(n)&&n.expression.getText(sf)==='Object.assign'&&n.arguments.length===2&&n.arguments[0].getText(sf)===formName){if(copy)throw 0;copy=n;}ts.forEachChild(n,find)}find(sf);if(!copy)throw 0;
 const source=ts.isAsExpression(copy.arguments[1])?copy.arguments[1].expression:copy.arguments[1];if(!ts.isIdentifier(source))throw 0;
 const statement=copy.parent;if(!ts.isExpressionStatement(statement)||!ts.isBlock(statement.parent))throw 0;
 const statements=statement.parent.statements;let run=statement.getText(sf);const index=statements.indexOf(statement);
 for(let i=index+1;i<statements.length;i++){const next=statements[i];if(!ts.isExpressionStatement(next)||!ts.isBinaryExpression(next.expression)||next.expression.left.getText(sf)!==binding)break;run+='\n'+next.getText(sf);}
 let AsyncValidator;try{AsyncValidator=Module.createRequire(path.join(ROOT,'admin/package.json'))('async-validator')}catch{const ep=Module.createRequire(path.join(ROOT,'admin/package.json')).resolve('element-plus');AsyncValidator=Module.createRequire(ep)('async-validator')};AsyncValidator=AsyncValidator.default||AsyncValidator;
 return {full,match,sf,field,binding,copy,statement,formName,input:source.text,runSource:ts.transpileModule(run,{compilerOptions:{target:ts.ScriptTarget.ES2021}}).outputText,AsyncValidator,rules:vm.runInNewContext('('+usd.initializer.getText(sf)+')')};
}
async function test(){const d=inspect();const cases=['5.00','10.00','30.00',5,10,30];let valid=0,unchanged=0,numeric=0,equivalent=0,sourceUnchanged=0;for(const input of cases){const row={id:1,[d.field]:input,price:10,name:'Synthetic',status:1,remark:'synthetic'},before={...row},form={};vm.runInNewContext(d.runSource,{[d.formName]:form,[d.input]:row,Object,Number});numeric+=typeof form[d.field]==='number'&&Number.isFinite(form[d.field]);equivalent+=Number(form[d.field])===Number(input);unchanged+=Object.entries(before).filter(([key])=>key!==d.field).every(([key,value])=>form[key]===value);sourceUnchanged+=JSON.stringify(row)===JSON.stringify(before);try{await new d.AsyncValidator({[d.field]:d.rules}).validate(form);valid++;}catch{}}
 const invalid=['0.00','-1.00','invalid',''];let rejected=0;for(const input of invalid){const form={},row={[d.field]:input};vm.runInNewContext(d.runSource,{[d.formName]:form,[d.input]:row,Object,Number});try{await new d.AsyncValidator({[d.field]:d.rules}).validate(form)}catch{rejected++}}
 const passed=valid===cases.length&&numeric===cases.length&&equivalent===cases.length&&unchanged===cases.length&&sourceUnchanged===cases.length&&rejected===invalid.length;process.exitCode=passed?0:1;
 process.stdout.write(JSON.stringify({syntheticPositiveCases:cases.length,positivePriceValidationPassed:valid,actualEditPriceNumeric:numeric,priceValuePreserved:equivalent,otherFormFieldsUnchanged:unchanged,sourceRecordUnchanged:sourceUnchanged,syntheticInvalidCases:invalid.length,invalidPricesRejected:rejected,regressionPassed:passed}));}
if(require.main===module)test().catch(()=>{process.exitCode=1;process.stdout.write(JSON.stringify({regressionPassed:false,errorClass:'REGRESSION_EXECUTION_FAILED'}))});
module.exports={inspect};
