/* ProjectPro — reference data: currencies, categories, unit options, and
 * 18 project templates with phases, tasks and starter estimate items. */
'use strict';
window.PP = window.PP || {};

PP.templates = (() => {

  const CURRENCIES = [
    ['AUD', 'Australian dollar ($)'], ['NZD', 'New Zealand dollar ($)'], ['USD', 'US dollar ($)'],
    ['CAD', 'Canadian dollar ($)'], ['GBP', 'British pound (£)'], ['EUR', 'Euro (€)'],
    ['ZAR', 'South African rand (R)'], ['INR', 'Indian rupee (₹)'], ['JPY', 'Japanese yen (¥)'],
    ['PHP', 'Philippine peso (₱)'], ['SGD', 'Singapore dollar ($)'], ['HKD', 'Hong Kong dollar ($)'],
    ['FJD', 'Fijian dollar ($)'], ['IDR', 'Indonesian rupiah (Rp)'], ['THB', 'Thai baht (฿)'],
    ['MYR', 'Malaysian ringgit (RM)'], ['VND', 'Vietnamese dong (₫)'], ['KRW', 'South Korean won (₩)'],
    ['CNY', 'Chinese yuan (¥)'], ['AED', 'UAE dirham'], ['SAR', 'Saudi riyal'], ['BRL', 'Brazilian real (R$)'],
    ['MXN', 'Mexican peso ($)'], ['CHF', 'Swiss franc (CHF)'], ['SEK', 'Swedish krona (kr)'],
    ['NOK', 'Norwegian krone (kr)'], ['DKK', 'Danish krone (kr)'], ['PLN', 'Polish złoty (zł)'],
    ['TRY', 'Turkish lira (₺)'], ['NGN', 'Nigerian naira (₦)'], ['KES', 'Kenyan shilling (KSh)'],
    ['PKR', 'Pakistani rupee (₨)']
  ];

  const MATERIAL_CATEGORIES = [
    'Timber & Sheet', 'Concrete & Masonry', 'Paint & Coatings', 'Roofing', 'Flooring & Tiles',
    'Plumbing', 'Electrical', 'Fixings & Hardware', 'Garden & Landscaping', 'Aggregates & Soil',
    'Insulation & Plasterboard', 'Tools & Consumables', 'Cleaning Supplies', 'Safety & PPE', 'Other'
  ];

  const EXPENSE_CATEGORIES = ['Materials', 'Labour', 'Equipment hire', 'Fuel & Travel', 'Delivery', 'Waste & Disposal', 'Subcontractor', 'Permits & Fees', 'Other'];

  const UNIT_OPTIONS = ['ea', 'm', 'm²', 'm³', 'L', 'kg', 't', 'bag', 'box', 'roll', 'sheet', 'pack', 'hr', 'day', 'km', 'visit', 'job', 'L/m', 'ft', 'ft²'];
  const LINE_TYPES = [
    ['material', 'Material', 'materials'], ['labour', 'Labour', 'labour'], ['equipment', 'Equipment', 'equipment'],
    ['travel', 'Travel', 'travel'], ['fuel', 'Fuel', 'fuel'], ['delivery', 'Delivery', 'deliver'],
    ['waste', 'Waste / disposal', 'waste'], ['fee', 'Fees / permits', 'invoice2'], ['other', 'Other', 'notes']
  ];

  const T = (id, name, icon, desc, phases, items = [], mats = []) => ({ id, name, icon, description: desc, phases, starterItems: items, suggestedMaterials: mats });

  const TEMPLATES = [
    T('building', 'Building & Renovation', 'build', 'Extensions, renovations, sheds and structural work.',
      [
        { name: 'Planning & approvals', tasks: ['Confirm scope & drawings with client', 'Measure site and verify dimensions', 'Apply for permits/approval', 'Order long-lead materials'] },
        { name: 'Site preparation', tasks: ['Set up site fencing & safety', 'Demolition / strip-out', 'Dispose of demolition waste', 'Set out levels & footings'] },
        { name: 'Structure', tasks: ['Pour footings/slab or set piers', 'Frame walls, floor and roof', 'Install windows & door frames', 'Roofing & cladding'] },
        { name: 'Services & linings', tasks: ['Rough-in plumbing & electrical', 'Insulation & plasterboard', 'Waterproofing wet areas', 'Joinery installation'] },
        { name: 'Fit-off & finish', tasks: ['Fit-off plumbing & electrical', 'Painting & finishing', 'Flooring / tiling', 'Hardware & fittings'] },
        { name: 'Handover', tasks: ['Defect inspection & touch-ups', 'Site clean-up', 'Final invoice & handover', 'Collect certificates/warranties'] }
      ],
      [
        { type: 'material', name: 'Framing timber', qty: 0, unit: 'm', unitCost: 8.5, markupPct: 20 },
        { type: 'material', name: 'Plasterboard sheets', qty: 0, unit: 'sheet', unitCost: 16, markupPct: 20 },
        { type: 'labour', name: 'Carpenter (qualified)', qty: 0, unit: 'hr', unitCost: 75, markupPct: 15 },
        { type: 'equipment', name: 'Skip bin (6m³)', qty: 1, unit: 'ea', unitCost: 550, markupPct: 10 },
        { type: 'fee', name: 'Building permit', qty: 1, unit: 'ea', unitCost: 800, markupPct: 0 }
      ],
      ['Framing pine MGP10 90x45', 'Plasterboard 10mm 2400x1200', 'Structural screws 14g', 'Concrete 20MPa']),

    T('painting', 'Painting', 'paint', 'Interior/exterior residential and commercial painting.',
      [
        { name: 'Preparation', tasks: ['Protect floors, furniture & gardens', 'Wash / sugar soap surfaces', 'Scrape, sand & fill defects', 'Gap seal and mask edges', 'Spot prime bare areas'] },
        { name: 'Painting', tasks: ['Apply undercoat / first coat', 'Cut in & second coat — ceilings', 'Walls — two coats', 'Trim, doors & skirting', 'Exterior weatherboards/render (if scoped)'] },
        { name: 'Finish', tasks: ['Remove masking & clean edges', 'Touch-ups & defect check', 'Pack up & clean site', 'Walkthrough with client'] }
      ],
      [
        { type: 'material', name: 'Premium wall paint', qty: 0, unit: 'L', unitCost: 16, markupPct: 25 },
        { type: 'material', name: 'Undercoat / primer', qty: 0, unit: 'L', unitCost: 12, markupPct: 25 },
        { type: 'labour', name: 'Painter', qty: 0, unit: 'hr', unitCost: 55, markupPct: 20 },
        { type: 'equipment', name: 'Scaffold / platform hire', qty: 0, unit: 'day', unitCost: 120, markupPct: 10 }
      ],
      ['Interior wall paint low-sheen 15L', 'Exterior acrylic 15L', 'Undercoat 10L', 'Filler & caulk', 'Drop sheets & masking tape']),

    T('roofing', 'Roofing', 'roof', 'Re-roofs, repairs, guttering and insulation.',
      [
        { name: 'Assessment & setup', tasks: ['Safety plan & harness/edge protection', 'Inspect roof structure', 'Measure roof area & pitch'] },
        { name: 'Strip & repair', tasks: ['Remove existing roofing', 'Repair battens/sarking', 'Clear gutters & valleys', 'Dispose of old materials'] },
        { name: 'Install', tasks: ['Lay sarking/insulation', 'Install new sheets/tiles', 'Flashings, capping & valleys', 'Gutters & downpipes'] },
        { name: 'Finish', tasks: ['Seal & weather checks', 'Clean site & magnetic sweep', 'Client inspection'] }
      ],
      [
        { type: 'material', name: 'Roof sheets / tiles', qty: 0, unit: 'm²', unitCost: 28, markupPct: 20 },
        { type: 'labour', name: 'Roofing team', qty: 0, unit: 'hr', unitCost: 70, markupPct: 15 },
        { type: 'equipment', name: 'Edge protection / scaffold', qty: 1, unit: 'job', unitCost: 1800, markupPct: 10 },
        { type: 'waste', name: 'Roofing waste disposal', qty: 1, unit: 'job', unitCost: 450, markupPct: 10 }
      ],
      ['Colorbond sheeting', 'Roofing screws', 'Sarking insulation', 'Gutter & downpipe set']),

    T('flooring', 'Flooring', 'floor', 'Timber, laminate, hybrid vinyl and carpet installation.',
      [
        { name: 'Preparation', tasks: ['Measure rooms & confirm layout', 'Remove existing flooring', 'Check & level subfloor', 'Acclimatise new boards'] },
        { name: 'Installation', tasks: ['Lay underlay / moisture barrier', 'Install flooring rows', 'Cut around obstacles & doorways', 'Expansion gaps & transitions'] },
        { name: 'Finish', tasks: ['Install skirting/scotia & trims', 'Seal edges (wet areas)', 'Clean & final check'] }
      ],
      [
        { type: 'material', name: 'Flooring boards', qty: 0, unit: 'm²', unitCost: 45, markupPct: 25 },
        { type: 'material', name: 'Underlay', qty: 0, unit: 'm²', unitCost: 6, markupPct: 25 },
        { type: 'labour', name: 'Flooring installer', qty: 0, unit: 'm²', unitCost: 28, markupPct: 20 }
      ],
      ['Hybrid vinyl planks', 'Underlay 2mm', 'Scotia & trims', 'Floor leveller 20kg']),

    T('tiling', 'Tiling', 'tile', 'Bathrooms, kitchens, floors and splashbacks.',
      [
        { name: 'Preparation', tasks: ['Measure & plan tile layout', 'Check substrate condition', 'Waterproofing (wet areas)', 'Prime surfaces'] },
        { name: 'Tiling', tasks: ['Set out lines & dry lay', 'Lay tiles with spacers', 'Cut edges, niches & fixtures', 'Grout & silicone joints'] },
        { name: 'Finish', tasks: ['Clean haze & polish', 'Seal grout (if required)', 'Final inspection'] }
      ],
      [
        { type: 'material', name: 'Tiles', qty: 0, unit: 'm²', unitCost: 38, markupPct: 25 },
        { type: 'material', name: 'Adhesive & grout', qty: 0, unit: 'bag', unitCost: 32, markupPct: 20 },
        { type: 'labour', name: 'Tiler', qty: 0, unit: 'm²', unitCost: 65, markupPct: 15 },
        { type: 'material', name: 'Waterproofing membrane', qty: 0, unit: 'L', unitCost: 42, markupPct: 20 }
      ],
      ['Porcelain tiles 600x600', 'Tile adhesive 20kg', 'Grout 5kg', 'Waterproof membrane 15L']),

    T('concreting', 'Concreting', 'concrete', 'Slabs, driveways, paths, footings and decorative finishes.',
      [
        { name: 'Preparation', tasks: ['Set out & excavate', 'Formwork & levels', 'Compact base & crusher dust', 'Steel mesh & chairs'] },
        { name: 'Pour', tasks: ['Order concrete & pump', 'Pour, screed & float', 'Control joints & edging', 'Broom / exposed / stamped finish'] },
        { name: 'Cure & finish', tasks: ['Curing compound / wet cure', 'Strip formwork', 'Seal (optional)', 'Clean site'] }
      ],
      [
        { type: 'material', name: 'Concrete 25MPa', qty: 0, unit: 'm³', unitCost: 260, markupPct: 15 },
        { type: 'material', name: 'Steel mesh SL82', qty: 0, unit: 'sheet', unitCost: 68, markupPct: 20 },
        { type: 'labour', name: 'Concreter', qty: 0, unit: 'm²', unitCost: 45, markupPct: 15 },
        { type: 'equipment', name: 'Concrete pump', qty: 1, unit: 'job', unitCost: 800, markupPct: 10 }
      ],
      ['Concrete 25MPa', 'Steel mesh SL82', 'Formwork timber', 'Curing compound']),

    T('fencing', 'Fencing', 'fence', 'Timber, Colorbond, pool and rural fences.',
      [
        { name: 'Planning', tasks: ['Confirm boundary with client/neighbours', 'Check services (dial before you dig)', 'Measure fence line & mark posts', 'Order materials'] },
        { name: 'Posts', tasks: ['Dig/bore post holes', 'Set posts in concrete', 'Check line & level'] },
        { name: 'Install', tasks: ['Fit rails / panels / sheets', 'Install palings or sheets', 'Gates & hardware', 'Cap & finish'] },
        { name: 'Finish', tasks: ['Clean up & remove spoil', 'Final check with client'] }
      ],
      [
        { type: 'material', name: 'Posts (H4 treated)', qty: 0, unit: 'ea', unitCost: 16, markupPct: 25 },
        { type: 'material', name: 'Palings / panels', qty: 0, unit: 'm', unitCost: 22, markupPct: 25 },
        { type: 'material', name: 'Rapid-set concrete', qty: 0, unit: 'bag', unitCost: 12, markupPct: 20 },
        { type: 'labour', name: 'Fencing installer', qty: 0, unit: 'm', unitCost: 35, markupPct: 15 }
      ],
      ['Treated pine posts 100x100', 'Treated pine palings', 'Rapid set concrete 20kg', 'Galvanised rail brackets']),

    T('decking', 'Decking', 'deck', 'Timber and composite decks, pergolas and stairs.',
      [
        { name: 'Design & setup', tasks: ['Measure & design layout', 'Set out & dig footings', 'Install stumps/bearers', 'Joists & blocking'] },
        { name: 'Decking', tasks: ['Lay decking boards', 'Picture-frame edging', 'Stairs & handrails', 'Fix fascia'] },
        { name: 'Finish', tasks: ['Sand & clean', 'Oil / stain two coats', 'Final inspection'] }
      ],
      [
        { type: 'material', name: 'Decking boards', qty: 0, unit: 'm²', unitCost: 95, markupPct: 25 },
        { type: 'material', name: 'Joists & bearers', qty: 0, unit: 'm', unitCost: 9, markupPct: 20 },
        { type: 'material', name: 'Deck screws & fixings', qty: 1, unit: 'box', unitCost: 85, markupPct: 20 },
        { type: 'labour', name: 'Deck builder', qty: 0, unit: 'm²', unitCost: 85, markupPct: 15 },
        { type: 'material', name: 'Decking oil', qty: 0, unit: 'L', unitCost: 28, markupPct: 20 }
      ],
      ['Merbau decking 90x19', 'H3 joists 90x45', 'Deck screws 10g', 'Decking oil 10L']),

    T('landscaping', 'Landscaping', 'tree', 'Garden beds, turf, retaining walls, paving and planting.',
      [
        { name: 'Design & prep', tasks: ['Site measure & plan with client', 'Clear & level site', 'Soil improvement', 'Edging & retaining'] },
        { name: 'Hardscape', tasks: ['Paths & paving', 'Retaining walls / garden beds', 'Irrigation lines'] },
        { name: 'Softscape', tasks: ['Lay turf', 'Planting per plan', 'Mulch beds', 'Water in & fertilise'] },
        { name: 'Finish', tasks: ['Clean site', 'Care instructions to client'] }
      ],
      [
        { type: 'material', name: 'Turf', qty: 0, unit: 'm²', unitCost: 12, markupPct: 25 },
        { type: 'material', name: 'Garden soil / mulch', qty: 0, unit: 'm³', unitCost: 85, markupPct: 25 },
        { type: 'material', name: 'Pavers', qty: 0, unit: 'm²', unitCost: 42, markupPct: 25 },
        { type: 'labour', name: 'Landscaper', qty: 0, unit: 'hr', unitCost: 60, markupPct: 20 }
      ],
      ['Sir Walter turf', 'Garden mix (bulk)', 'Mulch (bulk)', 'Concrete pavers 400x400']),

    T('lawnmowing', 'Lawn Mowing & Maintenance', 'lawn', 'Regular mowing, edging, hedging and fertilising rounds.',
      [
        { name: 'Service', tasks: ['Mow all lawn areas', 'Edge paths, driveways & beds', 'Trim around obstacles', 'Blow down hard surfaces', 'Remove clippings', 'Weed spot-spray (opt.)'] }
      ],
      [
        { type: 'labour', name: 'Mowing service', qty: 1, unit: 'visit', unitCost: 55, markupPct: 40 },
        { type: 'fuel', name: 'Fuel allowance', qty: 0, unit: 'ea', unitCost: 8, markupPct: 0 },
        { type: 'travel', name: 'Travel', qty: 0, unit: 'km', unitCost: .95, markupPct: 0 }
      ],
      []),

    T('gardencleanup', 'Garden Clean-up', 'tree', 'One-off tidy-ups: pruning, weeding, green waste removal.',
      [
        { name: 'Clean-up', tasks: ['Walkthrough & photos before', 'Prune shrubs & small trees', 'Weed beds & spray paths', 'Rake leaves & debris', 'Mow & edge lawns', 'Load & tip green waste', 'Photos after & client sign-off'] }
      ],
      [
        { type: 'labour', name: 'Garden labour', qty: 0, unit: 'hr', unitCost: 55, markupPct: 20 },
        { type: 'waste', name: 'Green waste disposal', qty: 0, unit: 'm³', unitCost: 90, markupPct: 15 },
        { type: 'equipment', name: 'Trailer / equipment', qty: 1, unit: 'day', unitCost: 60, markupPct: 0 }
      ],
      []),

    T('treework', 'Tree Work & Removal', 'tree', 'Tree removal, pruning, stump grinding and storm damage.',
      [
        { name: 'Assessment', tasks: ['Site & risk assessment', 'Check council permit requirements', 'Plan drop zone & rigging', 'Set up exclusion zone'] },
        { name: 'Tree work', tasks: ['Climb / EWP access', 'Sectional dismantle & lower', 'Remove to ground level', 'Stump grinding (opt.)'] },
        { name: 'Finish', tasks: ['Chip branches & remove timber', 'Rake & blow site', 'Final check'] }
      ],
      [
        { type: 'labour', name: 'Arborist crew', qty: 0, unit: 'hr', unitCost: 180, markupPct: 15 },
        { type: 'equipment', name: 'Chipper / EWP hire', qty: 0, unit: 'day', unitCost: 450, markupPct: 10 },
        { type: 'waste', name: 'Tip fees (timber/green)', qty: 0, unit: 'ea', unitCost: 120, markupPct: 10 },
        { type: 'fee', name: 'Council permit', qty: 0, unit: 'ea', unitCost: 150, markupPct: 0 }
      ],
      []),

    T('pressurewashing', 'Pressure Washing', 'water', 'Driveways, paths, roofs, house washing and concrete sealing.',
      [
        { name: 'Service', tasks: ['Pre-treat stains & mould', 'Pressure clean surfaces', 'Soft-wash house exterior (opt.)', 'Rinse & detail edges', 'Apply sealer (opt.)', 'Final rinse & tidy'] }
      ],
      [
        { type: 'labour', name: 'Pressure washing', qty: 0, unit: 'm²', unitCost: 5.5, markupPct: 30 },
        { type: 'material', name: 'Cleaning chemicals', qty: 0, unit: 'L', unitCost: 18, markupPct: 25 },
        { type: 'equipment', name: 'Machine fuel & wear', qty: 1, unit: 'job', unitCost: 25, markupPct: 0 }
      ],
      ['Sodium hypochlorite 15L', 'Concrete sealer 20L']),

    T('handyman', 'Handyman Services', 'handyman', 'General repairs, maintenance, assembly and odd jobs.',
      [
        { name: 'Job', tasks: ['Confirm job list with client', 'Pick up materials', 'Complete repairs / tasks', 'Test & demonstrate', 'Clean up'] }
      ],
      [
        { type: 'labour', name: 'Handyman labour', qty: 1, unit: 'hr', unitCost: 65, markupPct: 20 },
        { type: 'material', name: 'Materials & hardware', qty: 1, unit: 'job', unitCost: 0, markupPct: 25 },
        { type: 'travel', name: 'Call-out / travel', qty: 1, unit: 'ea', unitCost: 40, markupPct: 0 }
      ],
      []),

    T('cleaning', 'Cleaning', 'clean', 'Regular house cleans, bond/end-of-lease and builders cleans.',
      [
        { name: 'Clean', tasks: ['Kitchen benchtops, appliances & sink', 'Bathrooms & toilets sanitised', 'Dust all surfaces & cobwebs', 'Vacuum carpets & rugs', 'Mop hard floors', 'Windows & tracks (opt.)', 'Walls & skirting spot-clean (opt.)'] }
      ],
      [
        { type: 'labour', name: 'Cleaner', qty: 0, unit: 'hr', unitCost: 40, markupPct: 25 },
        { type: 'material', name: 'Cleaning supplies', qty: 1, unit: 'job', unitCost: 15, markupPct: 0 }
      ],
      []),

    T('pool', 'Pool Maintenance', 'pool', 'Regular pool servicing, green pool recovery and repairs.',
      [
        { name: 'Service', tasks: ['Test & balance water chemistry', 'Skim, brush & vacuum', 'Empty baskets & check equipment', 'Backwash / clean filter', 'Inspect pump, chlorinator & seals', 'Report issues to client'] }
      ],
      [
        { type: 'labour', name: 'Pool service visit', qty: 1, unit: 'visit', unitCost: 85, markupPct: 35 },
        { type: 'material', name: 'Chemicals', qty: 0, unit: 'job', unitCost: 35, markupPct: 30 }
      ],
      ['Chlorine 20L', 'pH buffer / balancer']),

    T('moving', 'Moving Services', 'move', 'Home and office removals, packing and furniture delivery.',
      [
        { name: 'Move', tasks: ['Confirm inventory & access notes', 'Protect floors & doorways', 'Pack & wrap fragile items (opt.)', 'Load truck & secure', 'Transport', 'Unload & place furniture', 'Final walkthrough with client'] }
      ],
      [
        { type: 'labour', name: 'Removalists (per person)', qty: 2, unit: 'hr', unitCost: 65, markupPct: 20 },
        { type: 'equipment', name: 'Truck', qty: 0, unit: 'hr', unitCost: 80, markupPct: 15 },
        { type: 'material', name: 'Boxes & packing materials', qty: 0, unit: 'job', unitCost: 120, markupPct: 25 },
        { type: 'fuel', name: 'Fuel', qty: 0, unit: 'ea', unitCost: 60, markupPct: 0 }
      ],
      []),

    T('custom', 'Custom Project', 'star', 'Blank project — build your own phases, tasks and estimate.',
      [
        { name: 'Phase 1', tasks: [] }
      ],
      [], [])
  ];

  return { CURRENCIES, MATERIAL_CATEGORIES, EXPENSE_CATEGORIES, UNIT_OPTIONS, LINE_TYPES, TEMPLATES };
})();
