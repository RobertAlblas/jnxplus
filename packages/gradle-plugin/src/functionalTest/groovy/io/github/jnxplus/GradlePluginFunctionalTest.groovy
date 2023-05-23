/*
 * This Groovy source file was generated by the Gradle 'init' task.
 */
package io.github.jnxplus

import org.gradle.testkit.runner.GradleRunner
import spock.lang.Specification
import spock.lang.TempDir

/**
 * A simple functional test for the 'io.github.jnxplus.projects' plugin.*/
class GradlePluginFunctionalTest extends Specification {
  @TempDir
  private File projectDir

  private getBuildFile() {
    new File(projectDir, "build.gradle")
  }

  private getSettingsFile() {
    new File(projectDir, "settings.gradle")
  }

  def "can run task"() {
    given:
    settingsFile << ""
    buildFile << """
plugins {
    id('io.github.jnxplus')
}
"""

    when:
    def runner = GradleRunner.create()
    runner.forwardOutput()
    runner.withPluginClasspath()
    runner.withArguments("projectDependencyReport", "--outputFile", "./build/example.json")
    runner.withProjectDir(projectDir)
    def result = runner.build()

    then:
    result.output.contains("Task ran for projectDependencyReport")
  }
}