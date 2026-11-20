import useStore, { VIEW_MODE } from '../../store/useStore'
import portfolioData from '../../data/data.json'
import styles from './SimplifiedView.module.css'

const { owner, skills, projects } = portfolioData

export default function SimplifiedView() {
  const setViewMode = useStore((s) => s.setViewMode)

  function handleBack() {
    setViewMode(VIEW_MODE.THREED)
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.container}>
        {/* Back button */}
        <button className={styles.backBtn} onClick={handleBack}>
          ← Return to System
        </button>

        {/* ── Hero Profile Card ─────────────────────────────────────────── */}
        <section className={styles.heroCard}>
          <div className={styles.avatarRing}>
            <div className={styles.avatarInner}>
              <svg viewBox="0 0 24 24" fill="rgba(224,224,224,0.5)" width="48" height="48">
                <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
              </svg>
            </div>
          </div>
          <h1 className={styles.heroName}>{owner.name}</h1>
          <div className={styles.heroSubtitle}>
            🚀 {owner.title.toUpperCase()}
          </div>
          <p className={styles.heroBio}>{owner.about}</p>
          <div className={styles.iconRow}>
            {owner.github && (
              <a href={owner.github} target="_blank" rel="noopener noreferrer" className={styles.iconBtn} title="GitHub">
                &lt;/&gt;
              </a>
            )}
            {owner.linkedin && (
              <a href={owner.linkedin} target="_blank" rel="noopener noreferrer" className={styles.iconBtn} title="LinkedIn">
                📋
              </a>
            )}
            {owner.email && (
              <a href={`mailto:${owner.email}`} className={styles.iconBtn} title="Email">
                ✉
              </a>
            )}
          </div>
        </section>

        {/* ── Two-Column: Skills + Mission Log ──────────────────────────── */}
        <div className={styles.twoCol}>
          {/* Skills */}
          <section className={styles.panel}>
            <h2 className={styles.sectionTitle}>
              ⚙️ Skill Constellation
            </h2>
            <div className={styles.skillsGrid}>
              {skills.map((group) => (
                <div key={group.category} className={styles.skillCategory}>
                  <div className={styles.skillCatLabel}>{group.category}</div>
                  <div className={styles.tagList}>
                    {group.items.map((item) => (
                      <span key={item} className={styles.skillTag}>
                        <span className={styles.tagIcon}>◈</span> {item}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {owner.resume?.downloadUrl && (
              <a href={owner.resume.downloadUrl} download className={styles.downloadBtn}>
                ↓ Download Resume
              </a>
            )}
          </section>

          {/* Mission Log (Experience + Education) */}
          <section className={styles.panel}>
            <h2 className={styles.sectionTitle}>
              🕗 Mission Log
            </h2>
            <div className={styles.timeline}>
              {owner.resume?.experience?.map((exp, i) => (
                <div key={`exp-${i}`} className={styles.timelineItem}>
                  <div className={styles.timelineNodeWrap}>
                    <div className={styles.timelineNode}>⚙</div>
                    <div className={styles.timelineLine} />
                  </div>
                  <div className={styles.timelineContent}>
                    <div className={styles.timelineHeader}>
                      <h3 className={styles.timelineTitle}>{exp.role}</h3>
                      <span className={styles.dateBadge}>{exp.period}</span>
                    </div>
                    <div className={styles.timelineSubtitle}>{exp.company}</div>
                    <p className={styles.timelineDesc}>{exp.description}</p>
                  </div>
                </div>
              ))}
              {owner.resume?.education?.map((edu, i) => (
                <div key={`edu-${i}`} className={styles.timelineItem}>
                  <div className={styles.timelineNodeWrap}>
                    <div className={styles.timelineNode}>🎓</div>
                    <div className={styles.timelineLine} />
                  </div>
                  <div className={styles.timelineContent}>
                    <div className={styles.timelineHeader}>
                      <h3 className={styles.timelineTitle}>{edu.degree}</h3>
                      <span className={styles.dateBadge}>{edu.year}</span>
                    </div>
                    <div className={styles.timelineSubtitle}>{edu.institution}</div>
                    {edu.gpa && <p className={styles.timelineDesc}>GPA: {edu.gpa}</p>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* ── Interests ─────────────────────────────────────────────────── */}
        {owner.interests && owner.interests.length > 0 && (
          <section className={styles.panel}>
            <h2 className={styles.sectionTitle}>🔬 Research Interests</h2>
            <div className={styles.interestList}>
              {owner.interests.map((item) => (
                <span key={item} className={styles.interestTag}>{item}</span>
              ))}
            </div>
          </section>
        )}

        {/* ── Projects ──────────────────────────────────────────────────── */}
        <section className={styles.panel}>
          <h2 className={styles.sectionTitle}>🛰️ Project Logs</h2>
          <div className={styles.projectsGrid}>
            {projects.map((proj) => (
              <div
                key={proj.id}
                className={styles.projectCard}
                style={{ '--project-color': proj.color, '--project-color-alpha': `${proj.color}15` }}
              >
                <div className={styles.projectHeader}>
                  <div>
                    <div className={styles.projectDomain}>{proj.domain}</div>
                    <h3 className={styles.projectTitle}>{proj.title}</h3>
                    <div className={styles.projectShortDesc}>{proj.shortDesc}</div>
                  </div>
                  {proj.featured && <span className={styles.featuredBadge}>Featured</span>}
                </div>

                <p className={styles.projectBody}>{proj.fullDesc}</p>

                {proj.technologies && proj.technologies.length > 0 && (
                  <div className={styles.tagList} style={{ marginBottom: '16px' }}>
                    {proj.technologies.map((tech) => (
                      <span key={tech} className={styles.techTag} style={{ '--tag-color': proj.color }}>
                        {tech}
                      </span>
                    ))}
                  </div>
                )}

                {(proj.links?.repo || proj.links?.demo) && (
                  <div className={styles.linkGroup}>
                    {proj.links.repo && (
                      <a href={proj.links.repo} target="_blank" rel="noopener noreferrer" className={styles.flatLink}>
                        ↗ Repository
                      </a>
                    )}
                    {proj.links.demo && (
                      <a href={proj.links.demo} target="_blank" rel="noopener noreferrer" className={styles.flatLink}>
                        ↗ Live Demo
                      </a>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <footer className={styles.footer}>
          <div className={styles.footerLine} />
          <div className={styles.footerText}>
            SYS // {owner.name} — {new Date().getFullYear()}
          </div>
        </footer>
      </div>
    </div>
  )
}
