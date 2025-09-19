// Generates a sample master_template.xlsx with 3 sheets and example rows
// Comments in English per project convention

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

function generateWorkbook() {
  const wb = XLSX.utils.book_new();

  // Sheet: metrics (baseline dictionary)
  const metricsHeaders = ['metric_id','metric_name','system_id','canonical_unit','conversion_group_id','normal_min','normal_max','is_key_metric','source','explanation'];
  const metricsRows = [
    metricsHeaders,
    ['cholesterol_total','Total Cholesterol',1,'mg/dL','cholesterol_like',125,200,'Y','CDC','Total cholesterol level'],
    ['hdl','HDL Cholesterol',1,'mg/dL','cholesterol_like',40,90,'Y','CDC','High-density lipoprotein (good cholesterol)'],
    ['ldl','LDL Cholesterol',1,'mg/dL','cholesterol_like',70,130,'Y','CDC','Low-density lipoprotein (bad cholesterol)'],
    ['glucose_fasting','Fasting Glucose',6,'mg/dL','glucose_like',70,99,'Y','ADA','Fasting blood glucose'],
  ];
  const metricsWS = XLSX.utils.aoa_to_sheet(metricsRows);
  XLSX.utils.book_append_sheet(wb, metricsWS, 'metrics');

  // Sheet: synonyms
  const synHeaders = ['synonym_id','metric_id','synonym_name','notes'];
  const synRows = [
    synHeaders,
    ['syn1','cholesterol_total','TC','Total Cholesterol'],
    ['syn2','hdl','HDL-C','HDL Cholesterol'],
    ['syn3','ldl','LDL-C','LDL Cholesterol'],
    ['syn4','glucose_fasting','FBG','Fasting Blood Glucose'],
  ];
  const synWS = XLSX.utils.aoa_to_sheet(synRows);
  XLSX.utils.book_append_sheet(wb, synWS, 'synonyms');

  // Sheet: conversion_groups
  const convHeaders = ['conversion_group_id','canonical_unit','alt_unit','to_canonical_formula','from_canonical_formula','notes'];
  const convRows = [
    convHeaders,
    ['cholesterol_like','mg/dL','mmol/L','x * 38.67','x / 38.67','TC, LDL, HDL'],
    ['glucose_like','mg/dL','mmol/L','x * 18.0','x / 18.0','Glucose fasting'],
  ];
  const convWS = XLSX.utils.aoa_to_sheet(convRows);
  XLSX.utils.book_append_sheet(wb, convWS, 'conversion_groups');

  return wb;
}

function main() {
  const wb = generateWorkbook();
  const outDir = path.join(__dirname, '../public/data');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'master_template.xlsx');
  XLSX.writeFile(wb, outPath);
  console.log('Generated sample master template at:', outPath);
}

if (require.main === module) {
  main();
}


