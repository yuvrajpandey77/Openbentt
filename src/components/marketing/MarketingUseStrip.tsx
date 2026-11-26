import { overviewUseCases } from "@/config/marketingContent";

/** Horizontal use-case band — short titles + one sentence, ChatGPT-style. */
export function MarketingUseStrip() {
  return (
    <section id="uses" className="ov-uses" aria-label="What you can do">
      <div className="ov-container">
        <h2 className="ov-uses__heading">Use Openbentt for papers, agents, and everything in between.</h2>
        <ul className="ov-uses__rail">
          {overviewUseCases.map((u) => (
            <li key={u.id} className="ov-uses__card">
              <h3>{u.title}</h3>
              <p>{u.description}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
