# Orbital Guardian

Create a modern, highly immersive frontend web application for the following Smart India Hackathon problem statement:

“AI-Driven Collision Risk Assessment for Mega-Constellation Satellites.”

The website should look like a professional space traffic management and satellite intelligence platform, combining the aesthetics of NASA mission control, futuristic aerospace software, and modern AI dashboards.

1. Core Design Direction

Do NOT create a generic SaaS dashboard.

The interface should feel like an actual orbital command center used by satellite operators and aerospace engineers.

Visual characteristics:

Deep-space dark background

Black / midnight navy base

Subtle starfield

Glowing cyan, blue, violet and red accents

Glassmorphism panels

Thin technical borders

Subtle grid overlays

Holographic UI elements

Orbital trajectory lines

Satellite markers

Radar-style visualizations

Smooth animations

High information density without feeling cluttered

Premium aerospace/defense-tech aesthetic

The design should feel futuristic but still professional and usable.

Avoid:

Cartoonish space graphics

Excessive neon

Generic admin-dashboard styling

Huge gradients everywhere

Excessive rounded cards

Unnecessary animations

Stock space images

Cryptocurrency-style UI

Think:

NASA Mission Control × Palantir × SpaceX × futuristic AI command center

2. Landing / Home Screen

The first screen should immediately communicate what the system does.

Hero section:

Small eyebrow text:

ORBITAL INTELLIGENCE SYSTEM

Main heading:

AI-Driven Collision Risk Assessment

Supporting text:

Predict. Assess. Prevent.

Then a concise explanation:

“An intelligent orbital safety platform that analyzes satellite trajectories, predicts close approaches, evaluates collision probability, and helps operators make faster, safer orbital decisions.”

Add two primary actions:

Launch Mission Control

Explore Intelligence

The hero should have a large interactive 3D orbital visualization on the right/center.

3. Main 3D Orbital Visualization

This should be the visual centerpiece of the application.

Use:

Three.js / React Three Fiber

Create a realistic Earth in the center.

Around Earth, display multiple satellite constellations.

Each satellite should be represented by a small glowing spacecraft/node.

Show:

Orbital paths

Satellite trajectories

Different orbital planes

Satellite identifiers

Direction of movement

Close-approach indicators

Collision-risk zones

Predicted trajectory paths

Some satellites should have normal blue/cyan indicators.

Potentially dangerous objects should become:

yellow → orange → red

based on risk level.

When two satellites approach each other, display a visual connection between them and show:

CLOSE APPROACH DETECTED

The user should be able to:

Rotate Earth

Zoom

Pan

Click satellites

Hover over satellites

Inspect orbital paths

Toggle constellation visibility

Toggle debris visibility

Toggle risk visualization

The visualization should feel alive.

Satellites should slowly move along their orbital paths.

4. Mission Control Dashboard

When the user enters Mission Control, create a command-center interface.

Top navigation:

ORBITAL INTELLIGENCE

Navigation:

Overview

Constellations

Collision Risk

Predictions

Alerts

Analytics

Right side:

System status

Current UTC time

AI engine status

Data synchronization status

User/profile icon

5. Overview Dashboard

Create an information-dense but clean dashboard.

At the top show key metrics:

ACTIVE OBJECTS

24,681

TRACKED SATELLITES

18,420

CLOSE APPROACHES

127

HIGH-RISK EVENTS

08

AI CONFIDENCE

96.8%

LAST UPDATE

12 sec ago

Each metric should have a subtle animated indicator.

Below the metrics, place the large orbital visualization.

On the side, create:

ACTIVE ALERTS

Example:

🔴 CRITICAL
SAT-4821 → SAT-9032
TCA: 14 min
Collision Probability: 8.7%

🟠 HIGH
SAT-2314 → DEB-9182
TCA: 37 min
Collision Probability: 2.4%

🟡 MODERATE
SAT-7741 → SAT-8821
TCA: 2h 14m
Collision Probability: 0.8%

6. Collision Risk Intelligence

Create a dedicated page called:

COLLISION RISK

This should be one of the most important pages.

Display a large risk visualization.

Use a chart showing:

Collision Probability vs Time

with predicted probability curves.

Include:

Current probability

Maximum probability

Time of Closest Approach

Miss Distance

Relative velocity

Position uncertainty

Prediction confidence

Create a risk classification:

LOW

Probability < 0.1%

MODERATE

0.1% – 1%

HIGH

1% – 5%

CRITICAL

5%

Make the classification visually obvious.

7. AI Prediction Panel

Create an AI-powered intelligence panel.

Title:

AI ORBITAL ANALYSIS

Example output:

“Potential conjunction detected between SAT-4821 and SAT-9032.”

Then display:

Predicted Collision Probability
8.7%

Time of Closest Approach
14m 32s

Estimated Miss Distance
184 m

Relative Velocity
7.42 km/s

Prediction Confidence
96.8%

Then provide an explanation:

“Trajectory propagation indicates increasing positional convergence. Uncertainty analysis suggests a 68% confidence interval of ±74 m around the predicted miss distance.”

Add a button:

RUN DEEP ANALYSIS

When clicked, animate the analysis process.

Show stages:

TRACKING
↓
TRAJECTORY PROPAGATION
↓
UNCERTAINTY MODELING
↓
COLLISION PROBABILITY
↓
RISK CLASSIFICATION

8. Satellite Detail View

When a satellite is clicked, open a detailed intelligence panel.

Display:

SAT-4821

Status:

● OPERATIONAL

Information:

NORAD ID

Constellation

Orbit Type

Altitude

Inclination

Velocity

Eccentricity

Last Position Update

Show an orbital trajectory chart.

Also display:

UPCOMING CONJUNCTIONS

Object | TCA | Miss Distance | Risk

Provide a View Full Analysis button.

9. Constellation Management

Create a page:

CONSTELLATIONS

Show different satellite networks.

Example:

STARLINK
12,481 objects
98.4% operational

ONEWEB
634 objects
97.8% operational

GPS
31 objects
100% operational

CUSTOM CONSTELLATION
2,410 objects
99.1% operational

Clicking a constellation should filter the 3D orbital visualization.

10. Predictive Analytics

Create a page called:

PREDICTIVE INTELLIGENCE

Include:

24-HOUR RISK FORECAST

Line graph showing predicted collision/conjunction events.

RISK DISTRIBUTION

Donut or radial visualization:

Low
Moderate
High
Critical

ORBITAL DENSITY

Heatmap showing regions of orbital congestion.

CONJUNCTION TREND

Historical number of close approaches over:

24H / 7D / 30D

11. Alert Center

Create a dedicated alert interface.

Categories:

CRITICAL
HIGH
MEDIUM
LOW
RESOLVED

Each alert should contain:

Satellite pair
Time of closest approach
Collision probability
Miss distance
Confidence
Status

Example:

CRITICAL CONJUNCTION

SAT-4821 × SAT-9032

TCA: 14:32 UTC

Probability: 8.7%

Miss Distance: 184m

[VIEW ANALYSIS]

12. AI Recommendation System

The system should not only detect collisions.

It should help operators make decisions.

Create a panel:

RECOMMENDED ACTION

“Orbital maneuver recommended.”

Potential maneuver:

Raise altitude by 42 m

Expected result:

Collision probability:

8.7% → 0.03%

Fuel impact:

Low

Confidence:

94.2%

Buttons:

SIMULATE MANEUVER

COMPARE OPTIONS

13. Maneuver Simulation

Create an interactive simulation interface.

Allow users to compare:

CURRENT TRAJECTORY

versus

PROPOSED TRAJECTORY

Display both orbital paths in the 3D visualization.

Show:

Before:
Collision Probability — 8.7%

After:
Collision Probability — 0.03%

Miss Distance:
184m → 2.8km

This should visually demonstrate the value of the AI system.

14. Navigation

Use a futuristic but simple sidebar.

Logo:

ORBITAL AI

Navigation:

◉ Mission Control
◎ Constellations
◎ Collision Risk
◎ Predictions
◎ Alerts
◎ Analytics

At the bottom:

SYSTEM STATUS

● AI ENGINE ONLINE

● TRACKING ONLINE

● DATA STREAM ACTIVE

15. Animations

Animations are extremely important, but keep them professional.

Use:

Satellite movement

Orbital path animation

Pulsing risk indicators

Scanning radar

Data streaming effects

Smooth page transitions

Number counters

Chart animations

AI processing animations

Subtle star movement

Hover interactions

Glass panel transitions

When the AI analyzes an event, create a short cinematic sequence:

SCANNING ORBIT
→
PROPAGATING TRAJECTORY
→
ANALYZING UNCERTAINTY
→
CALCULATING COLLISION PROBABILITY
→
RISK ASSESSMENT COMPLETE

16. Technical Implementation

Use:

React

React Three Fiber

Three.js

Drei

Recharts or another suitable charting library

Use modular components.

Suggested structure:

components/

OrbitalScene

Earth

Satellite

OrbitPath

RiskIndicator

SatellitePanel

MetricCard

AlertPanel

RiskChart

AIAnalysis

Navigation

CommandHeader

ConstellationPanel

ManeuverSimulation

pages/

MissionControl

Constellations

CollisionRisk

Predictions

Alerts

Analytics

Keep the architecture clean and scalable.

17. Performance

The orbital visualization may contain thousands of objects.

Do NOT render thousands of individual heavy React components.

Use efficient Three.js techniques such as:

InstancedMesh

Level of Detail

Efficient geometries

Limited particle counts

Memoization

Throttled updates

GPU-friendly rendering

The application should remain smooth even with large simulated datasets.

18. Responsive Design

Desktop should be the primary experience because this is an aerospace command-center application.

However, make the interface responsive.

On tablets/mobile:

Collapse sidebar

Stack panels

Simplify orbital visualization

Preserve important metrics

Allow horizontal scrolling for complex data

19. Important Product Philosophy

The frontend should communicate that this is NOT merely a satellite tracker.

The story should be:

TRACK → PREDICT → ASSESS → SIMULATE → MITIGATE

The platform uses AI to transform raw orbital data into actionable collision-risk intelligence.

The user should understand this within the first 10 seconds of opening the website.

20. Final Visual Goal

The final result should look like a genuine futuristic aerospace operations platform.

Imagine opening the website and feeling like you are looking at:

“The operating system for orbital safety.”

It should be impressive enough for a Smart India Hackathon jury presentation while still being technically believable.

Prioritize:

Exceptional first impression

3D orbital visualization

Clear collision-risk visualization

AI prediction intelligence

Maneuver simulation

Professional aerospace UI

Smooth performance

Strong information hierarchy

Do not change the core functionality or invent unrelated features.

Build the frontend around the problem statement:

AI-Driven Collision Risk Assessment for Mega-Constellation Satellites.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/453994d2-c453-4b22-b006-b125bc58756f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
