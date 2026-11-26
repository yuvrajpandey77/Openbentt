import { overviewUseCases } from "@/config/marketingContent";

/** Capability cards — label, title, and one real product detail. */
export function MarketingUseStrip() {
  return (
    <section id="uses" className="ov-uses" aria-label="What you can do">
      <div className="ov-container">
        <h2 className="ov-uses__heading">Use Openbentt for papers, agents, and everything in between.</h2>
        <ul className="ov-uses__rail">
          {overviewUseCases.map((u) => (
            <li key={u.id} className="ov-uses__card">
              <p className="ov-uses__label">{u.label}</p>
              <h3>{u.title}</h3>
              <p className="ov-uses__detail">{u.detail}</p>
              <p className="ov-uses__proof">{u.proof}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
