import mermaid from './node_modules/mermaid/dist/mermaid.core.mjs';

mermaid.initialize({ startOnLoad: false });

async function run() {
  try {
    const text1 = 'mindmap\n  root\n    "主语 + be(\'am/is/are\') + going to + 动词原形"';
    await mermaid.parse(text1);
    console.log('text1 SUCCESS');
  } catch(e) {
    console.log('text1 FAILED: ' + e.message.split('\n')[0]);
  }
  
  try {
    const text2 = 'mindmap\n  root\n    node1["主语 + be(\'am/is/are\') + going to + 动词原形"]';
    await mermaid.parse(text2);
    console.log('text2 SUCCESS');
  } catch(e) {
    console.log('text2 FAILED: ' + e.message.split('\n')[0]);
  }
  
  try {
    const text3 = 'mindmap\n  root\n    node1("主语 + be(\'am/is/are\') + going to + 动词原形")';
    await mermaid.parse(text3);
    console.log('text3 SUCCESS');
  } catch(e) {
    console.log('text3 FAILED: ' + e.message.split('\n')[0]);
  }
  
  try {
    const text4 = 'mindmap\n  root\n    node1(("主语 + be(\'am/is/are\') + going to + 动词原形"))';
    await mermaid.parse(text4);
    console.log('text4 SUCCESS');
  } catch(e) {
    console.log('text4 FAILED: ' + e.message.split('\n')[0]);
  }
}

run();
