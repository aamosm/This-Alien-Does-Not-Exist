/* ============================================================
   OBSERVATION ENGINE
   Generates remote-sensing and telemetry-based metadata for entities.
   Written from the perspective of an automated, long-term 
   interstellar census network. Acknowledges uncertainty and
   relies on probabilistic and remote-sensor terminology.
   ============================================================ */

const ObservationEngine = {
    
    // Returns exactly ONE memorable, defining trait per entity.
    getDistinguishing: function(alien) {
        const g = alien.genome;
        
        // Safely extract optional properties
        const shoulderW = g.shoulderWidthScale || g.bodyWidth;
        const socketD = g.socketDepth || 0.5;
        const eyeR = g.eyeRadius || 0.5;
        const eyeB = g.eyeBulge || 0.5;
        const neckT = g.neckThickness || 1.0;
        const tailB = g.tailBaseThickness || 1.0;
        const eyeSpace = g.eyeSpacing || 0.5;
        const jointR = g.jointRadius || 1.0;
        const legT = g.legThickness || 1.0;

        const pool = [
            { cond: () => g.mass > 45000, text: "Extreme biological mass." },
            { cond: () => g.mass < 3000, text: "Extremely low body profile." },
            { cond: () => g.bodyLength > 3.2, text: "Hyper-elongated axial profile." },
            { cond: () => g.stanceRaw > 0.85, text: "Exceptionally stable posture." },
            { cond: () => g.stanceRaw < 0.15, text: "Unusually narrow balance baseline." },
            { cond: () => g.eyeCount === 0, text: "Complete absence of optical structures." },
            { cond: () => g.asymmetry > 0.85, text: "Severe morphological asymmetry." },
            { cond: () => g.tailLength > 3.0, text: "Hyper-extended caudal appendage." },
            { cond: () => g.neckLengthRaw > 2.0, text: "Unusually prolonged cervical column." },
            { cond: () => g.limbPairsRaw > 0.8, text: "Extreme limb redundancy." },
            { cond: () => g.limbPairsRaw < 0.1, text: "Minimal appendage configuration." },
            { cond: () => shoulderW > 1.8, text: "Exceptionally broad axial span." },
            { cond: () => shoulderW < 0.3, text: "Hyper-compressed lateral profile." },
            { cond: () => socketD > 0.85, text: "Deeply recessed optical organs." },
            { cond: () => eyeB > 0.85, text: "Pronounced optical protrusion." },
            { cond: () => eyeR > 0.85, text: "Oversized primary optics." },
            { cond: () => g.eyeClusterStyle === 'Radial', text: "Radial optical arrangement." },
            { cond: () => g.headSize > 1.8, text: "Oversized cranial volume." },
            { cond: () => tailB > 1.8, text: "Massive caudal base." },
            { cond: () => neckT > 1.8, text: "Unusually reinforced cervical structure." },
            { cond: () => legT < 0.3, text: "Extremely slender limb profile." },
            { cond: () => legT > 1.8, text: "Exceptionally reinforced appendage structure." },
            { cond: () => jointR > 1.8, text: "Highly pronounced joint articulation." },
            { cond: () => eyeSpace < 0.2 && g.eyeCount > 1, text: "Exceptionally centralized optical cluster." },
            { cond: () => g.patternContrast > 0.9, text: "Highly disruptive surface contrast." },
            { cond: () => g.patternStyle > 0.9, text: "Intensely reticulated exterior pattern." },
            { cond: () => g.skinBrightness < 0.1, text: "Extremely low-albedo exterior." }
        ];

        const valid = pool.filter(p => p.cond());
        if (valid.length > 0) {
            // Deterministically select one based on the seed
            const idx = (alien.seed * 137) % valid.length;
            return valid[idx].text;
        }
        return "Unusually typical morphology.";
    },

    getPool: function(alien, states, analysis) {
        const g = alien.genome;
        const rarity = analysis ? analysis.rarityScore : 0.5;
        const physicalSig = alien.registry ? alien.registry.physicalSignature : 0.5;

        // Safely extract deeply nested or optional properties
        const shoulderW = g.shoulderWidthScale || g.bodyWidth;
        const neckT = g.neckThickness || 1.0;
        const jointR = g.jointRadius || 1.0;
        const legT = g.legThickness || 1.0;
        const socketOut = g.socketOutward || 0.5;
        const limbRoot = g.limbRootOffset || 0.5;
        const tailBase = g.tailBaseThickness || 1.0;
        const tailFlex = g.tailSegmentFactor || 1.0;
        
        const eyeStyle = g.eyeClusterStyle || 'Lateral';
        const eyeSpace = g.eyeSpacing || 0.5;
        const eyeVar = g.eyeRadiusVariation || 0.0;
        const clusterRot = g.clusterRotation || 0.0;
        const clusterRad = g.clusterRadius || 0.5;
        const socketD = g.socketDepth || 0.5;
        const eyeB = g.eyeBulge || 0.5;
        const lidTop = g.eyelidTop || 0.2;
        const lidBot = g.eyelidBottom || 0.2;
        const irisPat = g.irisPattern || 0.5;
        const eyeR = g.eyeRadius || 0.5;

        return [
            /* ==========================================================
               MORPHOLOGY (Physical geometry & structure)
               ========================================================== */
            
            // Short, absolute observations [OBSERVED]
            { section: 'MORPHOLOGY', cond: () => g.asymmetry < 0.2, cert: "OBSERVED", text: "Bilateral symmetry." },
            { section: 'MORPHOLOGY', cond: () => g.neckLengthRaw > 0.7, cert: "OBSERVED", text: "Elongated cervical column." },
            { section: 'MORPHOLOGY', cond: () => g.neckLengthRaw < 0.2, cert: "OBSERVED", text: "Truncated cervical structure." },
            { section: 'MORPHOLOGY', cond: () => g.mass < 5000, cert: "OBSERVED", text: "Low profile." },
            { section: 'MORPHOLOGY', cond: () => g.eyeCount > 2, cert: "OBSERVED", text: "Clustered optical arrangement." },
            { section: 'MORPHOLOGY', cond: () => g.eyeCount > 4, cert: "OBSERVED", text: "Hyper-redundant optical array." },
            { section: 'MORPHOLOGY', cond: () => eyeStyle === 'Radial', cert: "OBSERVED", text: "Radial sensor arrangement." },
            { section: 'MORPHOLOGY', cond: () => eyeStyle === 'Arc', cert: "OBSERVED", text: "Arc-based sensor arrangement." },
            { section: 'MORPHOLOGY', cond: () => eyeStyle === 'Triangle', cert: "OBSERVED", text: "Triangular optical baseline." },
            { section: 'MORPHOLOGY', cond: () => eyeStyle === 'Stacked', cert: "OBSERVED", text: "Vertically stacked optical nodes." },
            { section: 'MORPHOLOGY', cond: () => eyeStyle === 'Linear', cert: "OBSERVED", text: "Linear sensor arrangement." },
            { section: 'MORPHOLOGY', cond: () => eyeStyle === 'Horizontal' && g.eyeCount === 2, cert: "OBSERVED", text: "Horizontal optical baseline." },
            { section: 'MORPHOLOGY', cond: () => socketD > 0.7, cert: "OBSERVED", text: "Deeply recessed optical organs." },
            { section: 'MORPHOLOGY', cond: () => socketD < 0.3, cert: "OBSERVED", text: "Externally mounted optical structures." },
            { section: 'MORPHOLOGY', cond: () => eyeB > 0.7, cert: "OBSERVED", text: "Pronounced optical protrusion." },
            { section: 'MORPHOLOGY', cond: () => eyeB < 0.3, cert: "OBSERVED", text: "Subdued optical structural profile." },
            { section: 'MORPHOLOGY', cond: () => eyeSpace > 0.7, cert: "OBSERVED", text: "Unusually wide visual baseline." },
            { section: 'MORPHOLOGY', cond: () => eyeSpace < 0.3 && g.eyeCount > 1, cert: "OBSERVED", text: "Tightly clustered visual organs." },
            { section: 'MORPHOLOGY', cond: () => eyeVar > 0.6, cert: "OBSERVED", text: "Heterogeneous optical sizes." },
            { section: 'MORPHOLOGY', cond: () => eyeVar < 0.2 && g.eyeCount > 1, cert: "OBSERVED", text: "Uniform optical development." },
            { section: 'MORPHOLOGY', cond: () => clusterRad > 0.7, cert: "OBSERVED", text: "Dispersed sensory cluster." },
            { section: 'MORPHOLOGY', cond: () => clusterRad < 0.3 && g.eyeCount > 1, cert: "OBSERVED", text: "Centralized sensory cluster." },
            { section: 'MORPHOLOGY', cond: () => clusterRot > 0.2, cert: "OBSERVED", text: "Visual cluster rotated relative to axial plane." },
            { section: 'MORPHOLOGY', cond: () => lidTop > 0.3 && lidBot > 0.3, cert: "OBSERVED", text: "Permanently narrowed optics." },
            { section: 'MORPHOLOGY', cond: () => lidTop < 0.1 && lidBot < 0.1, cert: "OBSERVED", text: "Permanently exposed optics." },
            { section: 'MORPHOLOGY', cond: () => irisPat > 0.7, cert: "OBSERVED", text: "Complex optical surface morphology." },
            { section: 'MORPHOLOGY', cond: () => irisPat < 0.3, cert: "OBSERVED", text: "Featureless optical surface morphology." },
            { section: 'MORPHOLOGY', cond: () => eyeR > 0.7, cert: "OBSERVED", text: "Oversized primary optics." },
            { section: 'MORPHOLOGY', cond: () => eyeR < 0.3 && g.eyeCount > 0, cert: "OBSERVED", text: "Reduced optical structures." },
            
            // Pigmentation & Surface [OBSERVED]
            { section: 'MORPHOLOGY', cond: () => g.skinHue < 0.15 || g.skinHue > 0.85, cert: "OBSERVED", text: "Warm pigmentation." },
            { section: 'MORPHOLOGY', cond: () => g.skinHue > 0.45 && g.skinHue < 0.65, cert: "OBSERVED", text: "Cold pigmentation." },
            { section: 'MORPHOLOGY', cond: () => g.skinHue >= 0.15 && g.skinHue <= 0.45, cert: "OBSERVED", text: "Neutral pigmentation." },
            { section: 'MORPHOLOGY', cond: () => g.skinBrightness < 0.2, cert: "OBSERVED", text: "Light-absorbing exterior." },
            { section: 'MORPHOLOGY', cond: () => g.skinBrightness > 0.8, cert: "OBSERVED", text: "High reflectance." },
            { section: 'MORPHOLOGY', cond: () => g.patternContrast > 0.7, cert: "OBSERVED", text: "Highly disruptive surface contrast." },
            { section: 'MORPHOLOGY', cond: () => g.patternContrast < 0.2, cert: "OBSERVED", text: "Nearly uniform pigmentation." },
            { section: 'MORPHOLOGY', cond: () => g.patternStyle > 0.7, cert: "OBSERVED", text: "Reticulated surface patterns." },
            { section: 'MORPHOLOGY', cond: () => g.patternStyle >= 0.3 && g.patternStyle <= 0.7, cert: "OBSERVED", text: "Banded pigmentation." },
            { section: 'MORPHOLOGY', cond: () => g.patternStyle < 0.3, cert: "OBSERVED", text: "Mottled surface pigmentation." },
            { section: 'MORPHOLOGY', cond: () => g.accentHueOffset > 0.5, cert: "OBSERVED", text: "Localized colour differentiation." },
            
            // The Human "Easter Egg" Observation
            { 
                section: 'MORPHOLOGY', 
                cond: () => g.bodyPlan === 'Biped' && g.skinHue > 0.03 && g.skinHue < 0.08 && g.skinBrightness > 0.7 && g.patternContrast < 0.2, 
                cert: "OBSERVED", 
                text: "Statistically rare uniform peach-toned pigmentation; cross-referencing suggests this specific morphological baseline may occur across highly varied mass scales." 
            },

            // Skeleton & Limbs [OBSERVED]
            { section: 'MORPHOLOGY', cond: () => shoulderW > 1.3, cert: "OBSERVED", text: "Broad shoulder structure." },
            { section: 'MORPHOLOGY', cond: () => shoulderW < 0.7, cert: "OBSERVED", text: "Narrow shoulder profile." },
            { section: 'MORPHOLOGY', cond: () => neckT > 1.2, cert: "OBSERVED", text: "Heavily reinforced cervical column." },
            { section: 'MORPHOLOGY', cond: () => neckT < 0.8, cert: "OBSERVED", text: "Slender cervical column." },
            { section: 'MORPHOLOGY', cond: () => jointR > 1.2, cert: "OBSERVED", text: "Pronounced joint articulation." },
            { section: 'MORPHOLOGY', cond: () => jointR < 0.8, cert: "OBSERVED", text: "Compact limb articulation." },
            { section: 'MORPHOLOGY', cond: () => legT > 1.2, cert: "OBSERVED", text: "Heavily reinforced appendages." },
            { section: 'MORPHOLOGY', cond: () => legT < 0.8, cert: "OBSERVED", text: "Slender limb profile." },
            { section: 'MORPHOLOGY', cond: () => socketOut > 0.7, cert: "OBSERVED", text: "Lateral limb emergence." },
            { section: 'MORPHOLOGY', cond: () => socketOut < 0.3, cert: "OBSERVED", text: "Ventral limb attachment." },
            { section: 'MORPHOLOGY', cond: () => limbRoot > 0.7, cert: "OBSERVED", text: "Atypical axial limb spacing." },
            { section: 'MORPHOLOGY', cond: () => limbRoot < 0.3, cert: "OBSERVED", text: "Centralized axial limb spacing." },
            { section: 'MORPHOLOGY', cond: () => tailBase > 1.2, cert: "OBSERVED", text: "Massive caudal base." },
            { section: 'MORPHOLOGY', cond: () => tailBase < 0.8 && g.tailLength > 0.2, cert: "OBSERVED", text: "Slender caudal base." },
            { section: 'MORPHOLOGY', cond: () => tailFlex < 0.5, cert: "OBSERVED", text: "Rigid caudal structure." },
            { section: 'MORPHOLOGY', cond: () => tailFlex > 1.5, cert: "OBSERVED", text: "Highly flexible caudal structure." },

            // Reconstructed & probabilistic observations [LIKELY / POSSIBLE]
            { section: 'MORPHOLOGY', cond: () => g.stanceRaw > 0.7, cert: "LIKELY", text: "Motion reconstruction appears compatible with high lateral stability." },
            { section: 'MORPHOLOGY', cond: () => g.spineCurve > 0.5, cert: "LIKELY", text: "Spinal geometry is consistent with a lowered center of mass." },
            { section: 'MORPHOLOGY', cond: () => g.spineCurve < -0.5 && states.locomotion === 'Walking', cert: "POSSIBLE", text: "Ventral bowing may indicate mechanical tension storage for sudden acceleration." },
            { section: 'MORPHOLOGY', cond: () => g.jawDepthRaw > 0.7, cert: "LIKELY", text: "Mandibular capacity appears compatible with high-force material processing." },
            { section: 'MORPHOLOGY', cond: () => g.jawDepthRaw < 0.3, cert: "LIKELY", text: "Shallow mandibular structure may indicate a diet restricted to soft localized matter." },
            { section: 'MORPHOLOGY', cond: () => g.bodyPlan === 'Serpentine', cert: "LIKELY", text: "Continuous substrate contact." },
            { section: 'MORPHOLOGY', cond: () => g.snoutLengthRaw > 0.7, cert: "POSSIBLE", text: "Extended anterior structure may support probing into concealed pockets." },
            { section: 'MORPHOLOGY', cond: () => g.limbPairsRaw > 0.6, cert: "LIKELY", text: "Multi-limb configuration is consistent with kinetic redundancy." },
            { section: 'MORPHOLOGY', cond: () => g.neckLengthRaw < 0.2, cert: "LIKELY", text: "Truncated cervical development may require full body pivoting for reorientation." },
            { section: 'MORPHOLOGY', cond: () => g.headTilt > 0.2, cert: "POSSIBLE", text: "Upward cranial articulation is consistent with monitoring elevated thermal signatures." },
            { section: 'MORPHOLOGY', cond: () => g.tailLength < 0.2 && states.locomotion === 'Walking', cert: "LIKELY", text: "Balance appears to be maintained entirely by synchronized limb coordination." },
            { section: 'MORPHOLOGY', cond: () => g.bodyLength > 2.0 && g.limbPairsRaw < 0.4, cert: "POSSIBLE", text: "Elongated axial profile may permit high core flexibility." },
            { section: 'MORPHOLOGY', cond: () => g.mass > 30000, cert: "POSSIBLE", text: "Mass estimates appear consistent with dense internal structuring." },
            { section: 'MORPHOLOGY', cond: () => g.mass < 5000, cert: "POSSIBLE", text: "Low thermal profile and light mass suggest low-resistance movement." },

            /* ==========================================================
               BEHAVIOUR (Interactions, movement, threat responses)
               ========================================================== */

            { section: 'BEHAVIOUR', cond: () => states.explorationDrive > 0.7 && states.caution > 0.7, cert: "POSSIBLE", text: "Repeated remote observations suggest prolonged inspection of anomalies before immediate withdrawal." },
            { section: 'BEHAVIOUR', cond: () => states.explorationDrive > 0.7 && states.caution > 0.8, cert: "POSSIBLE", text: "Repeated observations suggest inspection of anomalies from maximum optical range." },
            { section: 'BEHAVIOUR', cond: () => states.explorationDrive > 0.7 && states.caution < 0.3, cert: "LIKELY", text: "Telemetry appears consistent with direct approaches toward orbital drop-probes." },
            { section: 'BEHAVIOUR', cond: () => states.explorationDrive < 0.3, cert: "OBSERVED", text: "Thermal mapping records prolonged stagnation within narrow geographical bounds." },
            { section: 'BEHAVIOUR', cond: () => states.volatility > 0.7, cert: "POSSIBLE", text: "Flight paths and motion vectors appear highly erratic and resist probabilistic modeling." },
            { section: 'BEHAVIOUR', cond: () => states.volatility < 0.3, cert: "LIKELY", text: "Motion vectors remain consistent across multiple orbital sweeps." },
            { section: 'BEHAVIOUR', cond: () => states.boldness > 0.8, cert: "LIKELY", text: "Postural shifts appear compatible with territorial responses to low-orbit surveyor activity." },
            { section: 'BEHAVIOUR', cond: () => states.boldness < 0.2, cert: "OBSERVED", text: "Optical lock was repeatedly lost due to immediate relocation into dense cover." },
            { section: 'BEHAVIOUR', cond: () => states.fixation > 0.8, cert: "LIKELY", text: "Long-term automated monitoring records extensive loops around localized geological features." },
            { section: 'BEHAVIOUR', cond: () => states.caution > 0.8, cert: "POSSIBLE", text: "Passive sensor arrays suggest rapid evasion behaviors upon atmospheric disturbance." },
            { section: 'BEHAVIOUR', cond: () => g.eyeCount === 0, cert: "LIKELY", text: "Motion reconstruction suggests reliance on non-visual spatial mapping." },
            { section: 'BEHAVIOUR', cond: () => states.explorationDrive > 0.6 && g.mass > 15000, cert: "POSSIBLE", text: "Mass and momentum may result in unintentional disruption of remote hardware during close passes." },
            { section: 'BEHAVIOUR', cond: () => states.explorationDrive > 0.6 && g.mass < 8000, cert: "LIKELY", text: "Kinetic analysis suggests precise, low-impact movements during investigation." },
            { section: 'BEHAVIOUR', cond: () => states.boldness > 0.6 && states.caution > 0.6, cert: "LIKELY", text: "Approaches moving anomalies while maintaining a strict minimum distance." },
            { section: 'BEHAVIOUR', cond: () => states.fixation > 0.6 && states.volatility < 0.4, cert: "LIKELY", text: "Telemetry is consistent with repetitive movement loops around specific topographical features." },
            { section: 'BEHAVIOUR', cond: () => states.explorationDrive > 0.6 && states.locomotion === 'Slithering', cert: "POSSIBLE", text: "Navigational patterns suggest extensive mapping of local subterranean or sheltered networks." },
            { section: 'BEHAVIOUR', cond: () => states.explorationDrive > 0.5, cert: "OBSERVED", text: "Radar signatures indicate active perimeter sweeps." },
            { section: 'BEHAVIOUR', cond: () => true, cert: "OBSERVED", text: "Entity periodically reorients relative to dominant wind currents." },
            { section: 'BEHAVIOUR', cond: () => states.caution > 0.6 && states.size === 'Massive', cert: "LIKELY", text: "Despite massive profile, telemetry indicates avoidance of direct physical contact." },
            { section: 'BEHAVIOUR', cond: () => states.explorationDrive < 0.4 && states.environmentalAttachment > 0.6, cert: "POSSIBLE", text: "Movement data is consistent with localized territorial anchoring." },
            { section: 'BEHAVIOUR', cond: () => true, cert: "POSSIBLE", text: "Telemetry suggests indifference to artificial light sources." },
            { section: 'BEHAVIOUR', cond: () => states.volatility > 0.8, cert: "OBSERVED", text: "Optical sensors record sporadic, non-rhythmic positional shifts." },

            /* ==========================================================
               ECOLOGY (Diet, locomotion, environment)
               ========================================================== */

            { section: 'ECOLOGY', cond: () => states.locomotion === 'Walking', cert: "LIKELY", text: "Ground-dwelling." },
            { section: 'ECOLOGY', cond: () => states.environmentalAttachment < 0.3, cert: "LIKELY", text: "Nomadic." },
            { section: 'ECOLOGY', cond: () => states.diet === 'Carnivore', cert: "POSSIBLE", text: "Spectroscopy appears compatible with the processing of local biomass." },
            { section: 'ECOLOGY', cond: () => states.diet === 'Herbivore', cert: "LIKELY", text: "Resource gathering may be restricted to specific environmental zones." },
            { section: 'ECOLOGY', cond: () => states.diet === 'Filter Feeder', cert: "POSSIBLE", text: "Atmospheric disturbance readings may indicate passive particulate absorption." },
            { section: 'ECOLOGY', cond: () => states.environmentalAttachment > 0.7, cert: "OBSERVED", text: "Biological signatures remain tethered to specific structural anchors." },
            { section: 'ECOLOGY', cond: () => states.environmentalAttachment < 0.2, cert: "OBSERVED", text: "Archived scans reveal a highly transient trajectory." },
            { section: 'ECOLOGY', cond: () => states.locomotion === 'Slithering', cert: "LIKELY", text: "Motion reconstruction is consistent with high efficiency on uneven substrates." },
            { section: 'ECOLOGY', cond: () => g.mass > 15000 && states.locomotion === 'Walking', cert: "OBSERVED", text: "Pedal locomotion creates localized micro-seismic disturbances." },
            { section: 'ECOLOGY', cond: () => g.bodyPlan === 'Tripod', cert: "OBSERVED", text: "Tri-lateral ground contact." },
            { section: 'ECOLOGY', cond: () => g.legLengthRaw > 0.7, cert: "POSSIBLE", text: "Extended limb proportions may elevate the primary core above ground-level obstructions." },
            { section: 'ECOLOGY', cond: () => g.mass < 5000, cert: "OBSERVED", text: "Low thermal footprint." },
            { section: 'ECOLOGY', cond: () => states.locomotion === 'Walking' && g.asymmetry > 0.5, cert: "LIKELY", text: "Gait analysis appears consistent with uneven weight distribution." },
            { section: 'ECOLOGY', cond: () => true, cert: "OBSERVED", text: "Displays preference for naturally sheltered pathways." },
            { section: 'ECOLOGY', cond: () => true, cert: "POSSIBLE", text: "Populations may shift predictably alongside seasonal temperature drops." },
            { section: 'ECOLOGY', cond: () => states.temperament === 'Skittish', cert: "LIKELY", text: "Data indicates heavy reliance on environmental occlusion." },
            { section: 'ECOLOGY', cond: () => g.mass < 5000, cert: "POSSIBLE", text: "Lidar suggests minimal disruption to local flora during traversal." },
            { section: 'ECOLOGY', cond: () => states.caution < 0.3, cert: "LIKELY", text: "Behavioral algorithms suggest periodic high-altitude observation dependency." },
            { section: 'ECOLOGY', cond: () => states.environmentalAttachment < 0.4, cert: "POSSIBLE", text: "Spectroscopic changes suggest rapid physiological adaptation to external temperature drops." },
            { section: 'ECOLOGY', cond: () => true, cert: "OBSERVED", text: "Orbital tracking frequently loses signature in high-humidity zones." },
            { section: 'ECOLOGY', cond: () => true, cert: "LIKELY", text: "Repeated remote observations are consistent with solitary biological cycles." },
            { section: 'ECOLOGY', cond: () => states.explorationDrive < 0.4, cert: "POSSIBLE", text: "Thermal imaging implies extended rest periods embedded in the substrate." },

            /* ==========================================================
               OBSERVATIONS & STATISTICAL (General notes & sensor limits)
               ========================================================== */

            { section: 'OBSERVATIONS', cond: () => true, cert: "OBSERVED", text: "Classification remains provisional." },
            { section: 'OBSERVATIONS', cond: () => true, cert: "OBSERVED", text: "Surface estimates only." },
            { section: 'OBSERVATIONS', cond: () => true, cert: "OBSERVED", text: "Incomplete reconstruction." },
            { section: 'OBSERVATIONS', cond: () => true, cert: "OBSERVED", text: "Sensor confidence reduced." },
            { section: 'OBSERVATIONS', cond: () => true, cert: "OBSERVED", text: "Occlusion detected." },
            { section: 'OBSERVATIONS', cond: () => true, cert: "POSSIBLE", text: "Thermal analysis may indicate localized metabolic variations." },
            { section: 'OBSERVATIONS', cond: () => true, cert: "LIKELY", text: "Repeated passes are consistent with avoidance of seismically active zones." },
            { section: 'OBSERVATIONS', cond: () => true, cert: "OBSERVED", text: "Long-range spectroscopy indicates surface compounds." },
            { section: 'OBSERVATIONS', cond: () => true, cert: "POSSIBLE", text: "Monitoring reveals periodic, low-energy stasis phases." },
            { section: 'OBSERVATIONS', cond: () => g.asymmetry > 0.6, cert: "OBSERVED", text: "Optical lock frequently broken by irregular silhouette." },
            { section: 'OBSERVATIONS', cond: () => states.caution > 0.7, cert: "LIKELY", text: "Observation windows remain brief." },
            { section: 'OBSERVATIONS', cond: () => states.explorationDrive > 0.8, cert: "OBSERVED", text: "Lack of evasion allowed for unusually high-fidelity structural scans." },
            { section: 'OBSERVATIONS', cond: () => g.stanceRaw > 0.7, cert: "LIKELY", text: "Wide stance produces broad impressions detectable by low-orbit topological sweeps." },
            { section: 'OBSERVATIONS', cond: () => states.volatility > 0.7, cert: "POSSIBLE", text: "Motion models suggest high energy expenditure during evasive maneuvers." },
            { section: 'OBSERVATIONS', cond: () => states.volatility > 0.7 && g.mass < 15000, cert: "POSSIBLE", text: "Kinetic modeling appears compatible with burst-oriented traversal." },
            { section: 'OBSERVATIONS', cond: () => true, cert: "LIKELY", text: "Intermittent spectral interference limits detailed material analysis." },
            { section: 'OBSERVATIONS', cond: () => g.mass < 10000 && g.stanceRaw > 0.5, cert: "POSSIBLE", text: "Motion analysis appears compatible with vertical scaling abilities." },
            
            // Rarity and typicality
            { section: 'OBSERVATIONS', cond: () => rarity > 0.8, cert: "OBSERVED", text: "Statistically uncommon morphological proportions." },
            { section: 'OBSERVATIONS', cond: () => rarity < 0.2, cert: "LIKELY", text: "Aligns closely with the local morphological baseline." },
            { section: 'OBSERVATIONS', cond: () => physicalSig > 0.45 && physicalSig < 0.55, cert: "OBSERVED", text: "Unusually typical morphology." },
            { section: 'OBSERVATIONS', cond: () => physicalSig < 0.2 || physicalSig > 0.8, cert: "OBSERVED", text: "Statistically uncommon structural baseline." }
        ];
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ObservationEngine;
} else if (typeof window !== 'undefined') {
    window.ObservationEngine = ObservationEngine;
}