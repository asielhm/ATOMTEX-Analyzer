"""Build from pinned public Sandia data; takes an XML path, never a measurement.
Usage: python tools/build_gamma_catalog.py /path/to/sandia.decay.xml
"""
import hashlib
import json
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET

REVISION = 'cd75314b56e12b80497531a1fbeed9c8e9968403'
SHA256 = '2794c284a47523ccdb9303a847b6ffd6afcd5f4a5c446d777e4c0f25b1728ebf'
NUCLIDES = ['Na22', 'K40', 'Co57', 'Co58', 'Co60', 'Mn54', 'Zn65', 'Ba133',
            'Cs134', 'Cs137', 'Eu152', 'Am241', 'Be7', 'I131', 'Tc99m', 'Ir192',
            'Se75', 'Cd109', 'Ra226', 'U235', 'Pb214', 'Bi214', 'Pb212', 'Bi212',
            'Tl208', 'Ac228', 'Th234', 'Pa234m']
raw = Path(sys.argv[1]).read_bytes()
if hashlib.sha256(raw).hexdigest() != SHA256:
    raise SystemExit('Unexpected checksum: use the pinned source; do not alter the expected hash.')
root = ET.fromstring(raw)
ns = {'d': 'sandia.decay.xsd'}
transitions = root.findall('d:transition', ns)
lines = []
def label(symbol):
    return re.sub(r'^([A-Za-z]+)(\d+)(m?)$', r'\1-\2\3', symbol)
for nuclide in NUCLIDES:
    emitter = 'Ba137m' if nuclide == 'Cs137' else nuclide
    parent_fraction = 1.0
    if nuclide == 'Cs137':
        parent_fraction = next(float(t.get('branchRatio')) for t in transitions
                               if t.get('parent') == 'Cs137' and t.get('child') == 'Ba137m')
    for transition in transitions:
        if transition.get('parent') != emitter:
            continue
        for gamma in transition.findall('d:gamma', ns):
            energy = float(gamma.get('energy'))
            intensity = float(gamma.get('intensity')) * float(transition.get('branchRatio')) * parent_fraction
            if 20 <= energy <= 3500 and intensity >= 0.005:
                lines.append({'nuclide': label(nuclide), 'emitter': label(emitter),
                              'energy': energy, 'emissionProbability': round(intensity, 10)})
lines.sort(key=lambda line: (line['nuclide'], line['energy']))
result = {
    'version': 'sandia-subset-1', 'sourceRevision': REVISION, 'sourceSha256': SHA256,
    'sourceUrl': f'https://github.com/sandialabs/SandiaDecay/blob/{REVISION}/sandia.decay.xml',
    'license': 'LGPL-2.1', 'nuclideCount': len(set(line['nuclide'] for line in lines)),
    'selection': '28 selected nuclides; gamma only, 20–3500 keV, probability per parent decay >=0.005. Cs-137 includes Ba-137m daughter branch. No chain-equilibrium assumption for other nuclides.',
    'lines': lines,
}
out = Path(__file__).resolve().parents[1] / 'src/data/gamma-lines.json'
out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(f'{len(lines)} lines, {result["nuclideCount"]} nuclides -> {out}')
