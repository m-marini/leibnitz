/**
 * 
 */
package org.mamrini.leibnitz.j3d;

import java.util.ArrayList;
import java.util.Enumeration;
import java.util.List;

import javax.media.j3d.Behavior;
import javax.media.j3d.WakeupCriterion;
import javax.media.j3d.WakeupOnActivation;
import javax.media.j3d.WakeupOnDeactivation;
import javax.media.j3d.WakeupOnElapsedFrames;
import javax.media.j3d.WakeupOr;

import org.mmarini.leibnitz.FunctionGenerator;
import org.mmarini.leibnitz.parser.FunctionParserException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * @author US00852
 * 
 */
public class LeibnitzBehaviour extends Behavior {
	private static Logger log = LoggerFactory.getLogger(LeibnitzBehaviour.class);

	private final WakeupOr activeCriterion;
	private final WakeupCriterion inactiveCriterion;
	private long last;
	private FunctionGenerator generator;
	private final List<Corpe> list;
	private long dt;

	/**
	 * 
	 */
	public LeibnitzBehaviour() {
		list = new ArrayList<Corpe>();
		inactiveCriterion = new WakeupOnActivation();
		activeCriterion = new WakeupOr(new WakeupCriterion[] {
				new WakeupOnElapsedFrames(1), new WakeupOnDeactivation() });
	}

	/**
	 * 
	 * @param string
	 * @param particle
	 */
	public void add(final Corpe particle) {
		list.add(particle);
	}

	/**
	 * @see javax.media.j3d.Behavior#initialize()
	 */
	@Override
	public void initialize() {
		wakeupOn(inactiveCriterion);
	}

	/**
	 * 
	 */
	private void processLocation() {
		final long now = System.nanoTime();
		long elapsed = now - last;
		if (elapsed < dt)
			/*
			 * if it has not past more then the time differential between
			 * previous update skip the new state computing
			 */
			return;
		/*
		 * Iterate the computing to match the elapsed time
		 */

		while (elapsed >= dt) {
			generator.apply();
			elapsed -= dt;
			last += dt;
		}
		for (final Corpe particle : list)
			particle.apply();
	}

	/**
	 * @see javax.media.j3d.Behavior#processStimulus(java.util.Enumeration)
	 */
	@Override
	public void processStimulus(@SuppressWarnings("rawtypes") final Enumeration conds) {
		while (conds.hasMoreElements()) {
			final Object el = conds.nextElement();
			if (el instanceof WakeupOnActivation) {
				last = System.nanoTime();
				wakeupOn(activeCriterion);
			} else if (el instanceof WakeupOnElapsedFrames) {
				processLocation();
				wakeupOn(activeCriterion);
			} else if (el instanceof WakeupOnDeactivation) {
				wakeupOn(inactiveCriterion);
			}
		}
	}

	/**
	 * @param generator
	 *            the generator to set
	 */
	public void setGenerator(final FunctionGenerator generator) {
		this.generator = generator;
		try {
			dt = Math.round(generator.getScalar("dt") * 1e9);
		} catch (final FunctionParserException e) {
			log.error(e.getMessage(), e);
		}
	}
}